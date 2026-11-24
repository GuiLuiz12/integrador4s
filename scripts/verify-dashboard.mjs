import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
export const flattenPanels = panels => panels.flatMap(panel => [panel, ...flattenPanels(panel.panels ?? [])]);
const regexEscape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Match the formatters used by these dashboards before calling the datasource proxy.
// Textbox IDs use :percentencode: quotes/backslashes remain data, never LogQL syntax.
export function expandExpression(expression, definition, from, to, overrides = {}) {
  const variables = new Map((definition.templating?.list ?? []).map(v => [v.name, v]));
  const duration = to - from;
  const builtins = {
    __range_s: String(duration / 1000), __range_ms: String(duration),
    __range: duration % 1000 ? `${duration}ms` : `${duration / 1000}s`,
    __interval: '15s', __interval_ms: '15000', __rate_interval: '1m',
    __from: String(from), __to: String(to),
  };
  return expression.replace(/\$\{([\w]+)(?::([\w]+))?\}|\$([\w]+)/g, (_, braced, format, plain) => {
    const name = braced ?? plain;
    if (Object.hasOwn(builtins, name)) return builtins[name];
    const variable = variables.get(name);
    assert.ok(variable, `Variável não resolvida na consulta: ${name}`);
    const value = overrides[name] ?? variable.current?.value ?? variable.options?.find(o => o.selected)?.value ?? variable.query;
    const values = Array.isArray(value) ? value : [value];
    if (values.includes('$__all')) return variable.allValue ?? '.*';
    if (format === 'percentencode') return encodeURIComponent(String(value)).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
    if (format === 'regex') return values.length > 1 ? `(${values.map(regexEscape).join('|')})` : regexEscape(value);
    assert.ok(!format || format === 'raw', `Formatter não suportado: ${format}`);
    return Array.isArray(value) ? value.join(',') : String(value);
  });
}

export function dashboardUrl(uid, from, to, { kiosk = false, panelId, variables = {} } = {}) {
  const query = new URLSearchParams({ from: String(from), to: String(to) });
  if (kiosk) query.set('kiosk', 'true');
  if (panelId !== undefined) query.set('viewPanel', `panel-${panelId}`);
  for (const [name, value] of Object.entries(variables)) query.set(`var-${name}`, value);
  return `/d/${uid}?${query}`;
}

function csvRowCount(csv) {
  let quoted = false;
  let rows = 0;
  for (let i = 0; i < csv.length; i++) {
    if (csv[i] === '"') {
      if (quoted && csv[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (csv[i] === '\n' && !quoted) rows++;
  }
  return rows + (csv.endsWith('\n') ? 0 : 1) - 1;
}

function linksOf(panel) {
  return [...(panel.links ?? []), ...(panel.fieldConfig?.defaults?.links ?? []),
    ...(panel.fieldConfig?.overrides ?? []).flatMap(o => o.properties.filter(p => p.id === 'links').flatMap(p => p.value))];
}

function validateLinks(definitions) {
  const destinations = new Map(definitions.map(d => [d.uid, new Set(flattenPanels(d.panels).map(p => p.id))]));
  let checked = 0;
  for (const definition of definitions) {
    const panels = flattenPanels(definition.panels);
    const links = [...(definition.links ?? []), ...panels.flatMap(linksOf)];
    for (const panel of panels.filter(p => p.type === 'text')) {
      for (const [, url] of (panel.options?.content ?? '').matchAll(/\]\(([^)]+)\)/g)) links.push({ url });
    }
    for (const link of links) {
      if (!link.url?.includes('/d/')) continue;
      const match = /\/d\/([^/?#]+)/.exec(link.url);
      assert.ok(match && destinations.has(match[1]), `Destino de navegação inexistente: ${link.url}`);
      const panelId = /[?&]viewPanel=(?:panel-)?(\d+)/.exec(link.url);
      if (panelId) assert.ok(destinations.get(match[1]).has(Number(panelId[1])), `Painel de destino inexistente: ${link.url}`);
      assert.match(link.url, /__url_time_range|(?:__from|from=)/, 'O drill-down deve preservar o início do período');
      assert.match(link.url, /__url_time_range|(?:__to|to=)/, 'O drill-down deve preservar o fim do período');
      checked++;
    }
  }
  assert.ok(checked >= 8, 'As visões devem oferecer navegação e aprofundamento dos blocos');
  return checked;
}

export async function main(argv = process.argv.slice(2)) {
  const { DASHBOARDS } = await import('./dashboard-model.mjs');
  const { values } = parseArgs({ args: argv, options: {
    from: { type: 'string' }, to: { type: 'string' }, 'output-dir': { type: 'string' }, 'session-dir': { type: 'string' },
  } });
  assert.equal(values.from !== undefined, values.to !== undefined, 'Informe --from e --to juntos, em formato ISO 8601');
  assert.ok(!values['session-dir'] || values.from === undefined, 'Use --session-dir ou --from/--to.');
  const manifestText = values['session-dir'] ? readFileSync(join(resolve(values['session-dir']), 'manifest.json'), 'utf8') : undefined;
  const manifest = manifestText ? JSON.parse(manifestText) : undefined;
  const to = manifest ? Date.parse(manifest.range_end) : values.to === undefined ? Date.now() : Date.parse(values.to);
  const from = manifest ? Date.parse(manifest.range_start) : values.from === undefined ? to - 3600_000 : Date.parse(values.from);
  assert.ok(Number.isFinite(from) && Number.isFinite(to) && from < to, 'O intervalo deve conter datas válidas, com início anterior ao fim');
  // --session-dir supplies provenance only: captures never rewrite an original session.
  const output = values['output-dir'] ? resolve(values['output-dir']) : join(root, 'evidence', 'runs', `cypark-${Date.now()}`);
  assert.ok(!existsSync(output), 'Use uma pasta nova para preservar capturas e resultados anteriores.');
  mkdirSync(output, { recursive: true });
  const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').trim().split('\n').map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
  }));
  const entries = Object.entries(DASHBOARDS);
  const expected = entries.map(([, item]) => JSON.parse(readFileSync(join(root, 'dashboards', item.file), 'utf8')));
  const snapshots = new Map(entries.map(([key], i) => [key, expected[i]]));
  const result = {
    schema_version: 2, result: 'running', captured_at: new Date().toISOString(),
    session_id: manifest?.session_id, source_manifest_sha256: manifestText ? hash(manifestText) : undefined,
    range_start: new Date(from).toISOString(), range_end: new Date(to).toISOString(),
    range_seconds: (to - from) / 1000, dashboards: {}, screenshots: [],
    expression_errors: [], javascript_errors: [], filters: [], navigation: [],
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, baseURL: 'http://localhost:3001' });
    const login = await context.request.post('/login', { data: { user: 'admin', password: env.GRAFANA_PASSWORD } });
    assert.equal(login.status(), 200, 'Login do Grafana deve funcionar');
    const preferences = await context.request.get('/api/user/preferences');
    assert.ok(preferences.ok(), 'Preferências do usuário devem estar acessíveis');
    result.theme = (await preferences.json()).theme;
    assert.equal(result.theme, 'aubergine', 'A preferência nativa Aubergine deve estar persistida');
    result.links_checked = validateLinks(expected);

    const csvFrames = new Map();
    let sampleLog;
    async function executeTarget(definition, panel, target, begin = from, end = to, variables = {}) {
      if (target.hide) return null;
      if (target.scenarioId === 'csv_content') {
        const response = await context.request.post('/api/ds/query', { data: {
          queries: [{ ...target, datasource: target.datasource ?? panel.datasource, intervalMs: 15000, maxDataPoints: 2000 }],
          from: String(begin), to: String(end),
        } });
        const body = await response.json();
        const queryResult = body.results?.[target.refId];
        const frame = queryResult?.frames?.[0];
        assert.ok(response.ok() && !queryResult?.error && frame?.data?.values?.length, `Dados analíticos ausentes: ${panel.title}`);
        assert.equal(frame.data.values[0].length, csvRowCount(target.csvContent), `Todas as linhas devem chegar ao Grafana: ${panel.title}`);
        return { kind: 'analysis', data: frame.data.values, hash: hash(JSON.stringify(frame.data.values)) };
      }
      if (!target.expr) return null;
      const expr = expandExpression(target.expr, definition, begin, end, variables);
      const type = (target.datasource ?? panel.datasource)?.type;
      if (type === 'loki') {
        const params = new URLSearchParams({ query: expr, start: String(BigInt(Math.trunc(begin)) * 1000000n),
          end: String(BigInt(Math.trunc(end)) * 1000000n), limit: String(target.maxLines ?? 200), step: '15' });
        const response = await context.request.get(`/api/datasources/proxy/uid/loki/loki/api/v1/query_range?${params}`);
        const body = await response.json();
        assert.ok(response.ok() && body.status === 'success', `${panel.title}: ${body.error ?? response.status()}`);
        return { kind: 'logs', expression: expr, ...body.data };
      }
      const params = new URLSearchParams({ query: expr, time: String(end / 1000) });
      const response = await context.request.get(`/api/datasources/proxy/uid/prometheus/api/v1/query?${params}`);
      const body = await response.json();
      assert.ok(response.ok() && body.status === 'success', `${panel.title}: ${body.error ?? response.status()}`);
      return { kind: 'metrics', expression: expr, ...body.data };
    }

    for (const [key, contract] of entries) {
      const definition = snapshots.get(key);
      const response = await context.request.get(`/api/dashboards/uid/${contract.uid}`);
      assert.equal(response.status(), 200, `Dashboard deve estar provisionado: ${contract.uid}`);
      const { dashboard } = await response.json();
      const served = flattenPanels(dashboard.panels);
      const expectedPanels = flattenPanels(definition.panels);
      assert.equal(dashboard.title, definition.title);
      assert.deepEqual(dashboard.links ?? [], definition.links ?? []);
      assert.deepEqual(dashboard.templating?.list ?? [], definition.templating?.list ?? []);
      assert.deepEqual(served.map(p => p.id).sort((a, b) => a - b), expectedPanels.map(p => p.id).sort((a, b) => a - b));
      for (const block of contract.blocks) {
        assert.ok(block.panelIds.length > 0, `Bloco sem painéis: ${block.id}`);
        for (const id of block.panelIds) assert.ok(served.some(p => p.id === id), `Bloco ${block.id}: painel ${id} ausente`);
      }
      assert.equal(contract.blocks.length, key === 'executive' ? 8 : 9);
      const summary = { uid: contract.uid, title: definition.title, blocks: contract.blocks.length, panels: served.length,
        analytical_queries: 0, metric_queries: 0, log_queries: 0, details: [] };
      result.dashboards[key] = summary;
      for (const panel of expectedPanels) {
        const actual = served.find(p => p.id === panel.id);
        assert.deepEqual(actual.targets ?? [], panel.targets ?? [], `Consultas provisionadas devem corresponder: ${panel.title}`);
        assert.deepEqual(actual.links ?? [], panel.links ?? [], `Links provisionados devem corresponder: ${panel.title}`);
        assert.equal(actual.description, panel.description, `Descrição provisionada deve corresponder: ${panel.title}`);
        for (const target of panel.targets ?? []) {
          try {
            const checked = await executeTarget(definition, panel, target);
            if (!checked) continue;
            if (checked.kind === 'analysis') { summary.analytical_queries++; csvFrames.set(`${key}:${panel.id}:${target.refId}`, checked.hash); }
            if (checked.kind === 'metrics') summary.metric_queries++;
            if (checked.kind === 'logs') {
              summary.log_queries++;
              if (!sampleLog && checked.resultType === 'streams' && checked.result[0]?.values[0]) sampleLog = JSON.parse(checked.result[0].values[0][1]);
            }
          } catch (error) { result.expression_errors.push({ dashboard: contract.uid, panel: panel.id, message: error.message }); }
        }
      }
      for (const detail of contract.details ?? []) {
        const panel = expectedPanels.find(p => p.id === detail.panelId);
        assert.ok(panel, `Detalhe ausente: ${detail.id}`);
        if (detail.expectedRows !== undefined) {
          const target = panel.targets.find(t => t.scenarioId === 'csv_content');
          assert.ok(target, `Tabela de detalhe sem dados: ${detail.id}`);
          assert.equal(csvRowCount(target.csvContent), detail.expectedRows, `Quantidade de registros: ${detail.id}`);
        }
        summary.details.push(detail.id);
      }
    }
    assert.deepEqual(result.expression_errors, [], 'Todas as consultas devem ser válidas');

    const technical = snapshots.get('technical');
    const technicalPanels = flattenPanels(technical.panels);
    const filterCases = [{ name: 'servico', value: 'api' }, { name: 'evento', value: 'authentication' },
      { name: 'correlacao', value: 'cypark-sem-correlacao-"\\-verificacao' }, { name: 'instancia', value: 'cypark-sem-instancia' }];
    for (const testCase of filterCases) {
      const affected = technicalPanels.flatMap(panel => (panel.targets ?? []).filter(t => t.expr?.includes(testCase.name)).map(target => ({ panel, target })));
      assert.ok(affected.length, `Filtro sem consultas associadas: ${testCase.name}`);
      let checked = 0;
      for (const { panel, target } of affected) {
        const data = await executeTarget(technical, panel, target, from, to, { [testCase.name]: testCase.value });
        if (testCase.name === 'servico') {
          for (const series of data.result ?? []) {
            const service = series.metric?.container_label_com_docker_compose_service;
            if (service !== undefined) assert.equal(service, 'api', 'Filtro de infraestrutura deve isolar o serviço');
          }
        }
        if (testCase.name === 'evento' && data.resultType === 'streams') {
          for (const stream of data.result) for (const [, line] of stream.values) assert.equal(JSON.parse(line).event, 'authentication');
        }
        if (['correlacao', 'instancia'].includes(testCase.name) && data.resultType === 'streams') {
          assert.equal(data.result.length, 0, 'Filtro inexistente deve produzir resultado vazio');
        }
        checked++;
      }
      result.filters.push({ variable: testCase.name, queries: checked, result: 'passed' });
    }
    if (sampleLog?.correlation_id && sampleLog?.instance_id) {
      const panel = technicalPanels.find(p => p.id === 420);
      const data = await executeTarget(technical, panel, panel.targets[0], from, to, {
        evento: sampleLog.event, correlacao: sampleLog.correlation_id, instancia: sampleLog.instance_id,
      });
      const events = data.result.flatMap(stream => stream.values.map(([, line]) => JSON.parse(line)));
      assert.ok(events.length > 0, 'A correlação de um evento observado deve continuar consultável');
      for (const event of events) {
        assert.equal(event.service, 'api');
        assert.equal(event.correlation_id, sampleLog.correlation_id);
        assert.equal(event.instance_id, sampleLog.instance_id);
        assert.equal(event.event, sampleLog.event);
      }
      result.filters.push({ variable: 'service + instance_id + correlation_id', matched_events: events.length, result: 'passed' });
    }

    const emptyFrom = Date.now() + 86400000;
    const emptyTo = emptyFrom + 3600000;
    let fixedQueries = 0;
    for (const [key] of entries) {
      const definition = snapshots.get(key);
      for (const panel of flattenPanels(definition.panels)) {
        for (const target of panel.targets ?? []) {
          const data = await executeTarget(definition, panel, target, emptyFrom, emptyTo);
          if (data?.kind === 'analysis') {
            assert.equal(data.hash, csvFrames.get(`${key}:${panel.id}:${target.refId}`), `Histórico não deve mudar com o período: ${panel.title}`);
            fixedQueries++;
          } else if (data?.result) {
            assert.equal(data.result.length, 0, `Período sem coleta não deve fabricar sucesso: ${panel.title}`);
          }
        }
      }
    }
    result.empty_range = { from: new Date(emptyFrom).toISOString(), to: new Date(emptyTo).toISOString(),
      fixed_queries_preserved: fixedQueries, result: 'passed' };

    const page = await context.newPage();
    page.on('pageerror', error => result.javascript_errors.push(error.message));
    const browserQueries = [];
    page.on('response', response => {
      if (!response.url().includes('/api/ds/query')) return;
      browserQueries.push((async () => {
        try {
          const body = await response.json();
          if (!response.ok()) result.expression_errors.push({ source: 'browser', status: response.status(), message: body.message ?? 'Consulta recusada' });
          for (const [refId, query] of Object.entries(body.results ?? {})) {
            if (query.error) result.expression_errors.push({ source: 'browser', refId, message: query.error });
          }
        } catch {
          // Navigating can cancel an obsolete request; the next page is checked normally.
          if (response.status() >= 400) result.expression_errors.push({ source: 'browser', status: response.status(), message: 'Resposta de consulta inválida' });
        }
      })());
    });
    async function show(definition, begin, end, options = {}) {
      await page.goto(dashboardUrl(definition.uid, begin, end, options), { waitUntil: 'networkidle' });
      const panel = options.panelId === undefined ? definition.panels.find(p => p.type !== 'row' && p.title) : flattenPanels(definition.panels).find(p => p.id === options.panelId);
      if (panel?.title) await page.getByText(panel.title, { exact: true }).first().waitFor({ state: 'visible' });
      if (!options.kiosk) {
        const closeMenu = page.getByRole('button', { name: 'Close menu', exact: true });
        if (await closeMenu.isVisible()) await closeMenu.click();
      }
      await page.waitForTimeout(1200);
      if (options.kiosk) {
        assert.equal(await page.getByRole('navigation').count(), 0, 'Kiosk deve ocultar a navegação do Grafana');
        assert.equal(await page.locator('header').count(), 0, 'Kiosk deve ocultar o cabeçalho do Grafana');
      }
    }
    async function capture(filename) {
      await page.screenshot({ path: join(output, filename) });
      result.screenshots.push(filename);
    }

    for (const viewport of [{ width: 1366, height: 1000 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      for (const kiosk of [false, true]) {
        for (const [key] of entries) {
          await show(snapshots.get(key), from, to, { kiosk });
          await capture(`${key}-${viewport.width}-${kiosk ? 'kiosk' : 'normal'}.png`);
        }
      }
    }
    await page.setViewportSize({ width: 1366, height: 1000 });
    for (const [key] of entries) {
      const definition = snapshots.get(key);
      await show(definition, 'now-1h', 'now', { kiosk: true });
      await capture(`${key}-relative.png`);
      await show(definition, emptyFrom, emptyTo, { kiosk: true });
      await capture(`${key}-no-data.png`);
    }
    await show(technical, from, to, { kiosk: true, variables: { servico: 'api', evento: 'authentication', correlacao: 'cypark-sem-correlacao', instancia: '.*' } });
    await capture('technical-filtered.png');

    // Exercise actual visible navigation in both normal and kiosk mode.
    for (const kiosk of [false, true]) {
      for (const [sourceKey, targetKey] of [['executive', 'technical'], ['technical', 'executive']]) {
        const source = snapshots.get(sourceKey);
        const target = snapshots.get(targetKey);
        const variables = { servico: 'api', evento: 'authentication', correlacao: 'cypark-sem-correlacao', instancia: '.*' };
        await show(source, from, to, { kiosk, variables });
        const links = page.locator(`a[href*="/d/${target.uid}"]`);
        let visible;
        for (const link of await links.all()) if (await link.isVisible()) { visible = link; break; }
        assert.ok(visible, `Navegação visível ${sourceKey} → ${targetKey}, kiosk=${kiosk}`);
        await visible.click();
        await page.waitForURL(url => url.pathname.includes(`/d/${target.uid}`));
        const actual = new URL(page.url());
        const timestamp = value => /^\d+$/.test(value) ? Number(value) : Date.parse(value);
        assert.equal(timestamp(actual.searchParams.get('from')), from);
        assert.equal(timestamp(actual.searchParams.get('to')), to);
        if (kiosk) assert.equal(actual.searchParams.get('kiosk'), 'true', 'Modo kiosk deve ser preservado');
        for (const [name, value] of Object.entries(variables)) assert.equal(actual.searchParams.get(`var-${name}`), value, `Contexto de ${name} deve ser preservado`);
        result.navigation.push({ from: sourceKey, to: targetKey, kiosk, variables_preserved: true, result: 'passed' });
      }
    }

    for (const [key, contract] of entries) {
      const definition = snapshots.get(key);
      for (const block of contract.blocks) {
        for (const panelId of block.panelIds) {
          await show(definition, from, to, { kiosk: true, panelId });
          await capture(`${key}-block-${block.id}-${panelId}.png`);
        }
      }
      for (const detail of contract.details ?? []) {
        await page.setViewportSize({ width: 1366, height: (detail.expectedRows ?? 0) > 15 ? 1600 : 1000 });
        await show(definition, from, to, { kiosk: true, panelId: detail.panelId });
        await capture(`${key}-detail-${detail.id}.png`);
      }
    }
    await Promise.all(browserQueries);
    assert.deepEqual(result.expression_errors, [], 'As consultas executadas pelo navegador devem ser válidas');
    assert.deepEqual(result.javascript_errors, [], 'As duas visões devem abrir sem erros JavaScript');
    result.analytical_queries = Object.values(result.dashboards).reduce((sum, d) => sum + d.analytical_queries, 0);
    result.metric_queries = Object.values(result.dashboards).reduce((sum, d) => sum + d.metric_queries, 0);
    result.log_queries = Object.values(result.dashboards).reduce((sum, d) => sum + d.log_queries, 0);
    result.indicators = JSON.parse(readFileSync(join(root, 'analysis/sprint2/analysis.json'), 'utf8')).indicators.length;
    result.sprint3_indicators = JSON.parse(readFileSync(join(root, 'analysis/sprint3/analysis.json'), 'utf8')).indicators.length;
    assert.equal(result.indicators, 18);
    assert.equal(result.sprint3_indicators, 12);
    result.result = 'passed';
    console.log(`CyPark validado: duas visões, filtros, navegação, períodos e capturas em ${output}.`);
  } catch (error) {
    result.result = 'failed';
    result.error = error.message;
    throw error;
  } finally {
    writeFileSync(join(output, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
