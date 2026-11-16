import { chromium } from 'playwright';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const { values } = parseArgs({ options: {
  from: { type: 'string' }, to: { type: 'string' }, 'output-dir': { type: 'string' }, 'session-dir': { type: 'string' },
} });
assert.equal(values.from !== undefined, values.to !== undefined, 'Informe --from e --to juntos, em formato ISO 8601');
assert.ok(!values['session-dir'] || values.from === undefined, 'Use --session-dir ou --from/--to.');
const manifestText = values['session-dir'] ? readFileSync(join(resolve(values['session-dir']), 'manifest.json'), 'utf8') : undefined;
const manifest = manifestText ? JSON.parse(manifestText) : undefined;
const to = manifest ? Date.parse(manifest.range_end) : values.to === undefined ? Date.now() : Date.parse(values.to);
const from = manifest ? Date.parse(manifest.range_start) : values.from === undefined ? to - 3600_000 : Date.parse(values.from);
assert.ok(Number.isFinite(from) && Number.isFinite(to) && from < to, 'O intervalo deve conter datas válidas, com início anterior ao fim');
const rangeSeconds = (to - from) / 1000;
const rangeDuration = Number.isInteger(rangeSeconds) ? `${rangeSeconds}s` : `${to - from}ms`;
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').trim().split('\n').map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
const output = values['output-dir'] === undefined
  ? (values['session-dir'] ? join(resolve(values['session-dir']), 'captures', `dashboard-${Date.now()}`) : fileURLToPath(new URL(`../evidence/runs/dashboard-${Date.now()}/`, import.meta.url)))
  : resolve(values['output-dir']);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, baseURL: 'http://localhost:3001' });
  const login = await context.request.post('/login', { data: { user: 'admin', password: env.GRAFANA_PASSWORD } });
  assert.equal(login.status(), 200, 'Login do Grafana deve funcionar');
  const definition = await context.request.get('/api/dashboards/uid/saude-v01');
  assert.equal(definition.status(), 200, 'Dashboard deve estar provisionado');
  const { dashboard } = await definition.json();
  const expectedDashboard = JSON.parse(readFileSync(new URL('../dashboards/saude.json', import.meta.url), 'utf8'));
  const analysis = JSON.parse(readFileSync(new URL('../analysis/sprint2/analysis.json', import.meta.url), 'utf8'));
  const sprint3Path = new URL('../analysis/sprint3/analysis.json', import.meta.url);
  const sprint3 = existsSync(sprint3Path) ? JSON.parse(readFileSync(sprint3Path, 'utf8')) : null;
  const flatten = panels => panels.flatMap(panel => [panel, ...flatten(panel.panels ?? [])]);
  const servedPanels = flatten(dashboard.panels);
  assert.equal(dashboard.title, expectedDashboard.title, 'Versão do dashboard provisionado deve estar atualizada');
  assert.deepEqual(dashboard.links ?? [], expectedDashboard.links ?? [], 'Links do dashboard devem corresponder à definição atual');
  for (const panel of flatten(expectedDashboard.panels).filter(p => p.targets?.some(t => t.scenarioId === 'csv_content'))) {
    const served = servedPanels.find(p => p.id === panel.id);
    assert.deepEqual(served?.targets, panel.targets, `Painel ${panel.title} deve usar os dados gerados atuais`);
    assert.deepEqual(served.links ?? [], panel.links ?? [], `Painel ${panel.title} deve usar os links atuais`);
    assert.equal(served.description, panel.description, `Painel ${panel.title} deve usar a descrição atual`);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const dashboardUrl = `/d/saude-v01?from=${from}&to=${to}&kiosk`;
  await page.goto(dashboardUrl, { waitUntil: 'networkidle' });
  await page.getByText(sprint3 ? 'Riscos residuais altos e críticos' : 'Riscos altos e críticos', { exact: true }).waitFor();
  // Allow first data queries and canvas rendering to complete before capture.
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(output, 'sintese.png') });
  const failures = [];
  let analyticalQueries = 0;
  let logQueries = 0;
  for (const panel of servedPanels) {
    for (const target of panel.targets ?? []) {
      if (target.scenarioId === 'csv_content') {
        analyticalQueries++;
        const response = await context.request.post('/api/ds/query', { data: {
          queries: [{ ...target, intervalMs: 15000, maxDataPoints: 1000 }], from: String(from), to: String(to),
        } });
        const body = await response.json();
        const result = body.results?.[target.refId];
        const frame = result?.frames?.[0];
        if (!response.ok() || result?.error || !frame?.data?.values?.some(values => values.length > 0)) {
          failures.push({ panel: panel.title, error: result?.error ?? body.message ?? 'Dados analíticos ausentes' });
        } else if (panel.title === 'Indicadores e decisão associada') {
          assert.equal(frame.data.values[0].length, analysis.indicators.length, 'Todos os indicadores devem aparecer no dashboard');
        } else if (panel.title === 'Indicadores Sprint 3 · cálculo e decisão') {
          assert.equal(frame.data.values[0].length, sprint3.indicators.length, 'Todos os indicadores Sprint 3 devem aparecer no dashboard');
        } else if (panel.title === 'Controles · critério, situação e evidência') {
          assert.equal(frame.data.values[0].length, 10, 'Todos os dez controles devem aparecer');
        } else if (panel.title === 'Plano de ação · execução e conclusão') {
          assert.equal(frame.data.values[0].length, sprint3.actions.length, 'Todas as ações devem aparecer');
        }
        continue;
      }
      const expr = target.expr?.replaceAll('$__range_s', String(rangeSeconds)).replaceAll('$__range', rangeDuration);
      if (!expr) continue;
      if (target.datasource?.type === 'loki') {
        logQueries++;
        const query = new URLSearchParams({ query: expr, start: String(Math.floor(from * 1e6)), end: String(Math.floor(to * 1e6)), limit: '100', step: '15' });
        const response = await context.request.get(`/api/datasources/proxy/uid/loki/loki/api/v1/query_range?${query}`);
        const body = await response.json();
        if (!response.ok() || body.status !== 'success') failures.push({ panel: panel.title, error: body.error ?? response.status() });
        continue;
      }
      const query = new URLSearchParams({ query: expr, time: String(to / 1000) });
      const response = await context.request.get(`/api/datasources/proxy/uid/prometheus/api/v1/query?${query}`);
      const body = await response.json();
      if (!response.ok() || body.status !== 'success') failures.push({ panel: panel.title, error: body.error ?? response.status() });
    }
  }
  assert.deepEqual(failures, [], 'Todas as expressões do dashboard devem ser válidas');
  assert.ok(analyticalQueries >= 10, 'As visões analíticas devem estar presentes e fornecer dados');
  const screenshots = ['sintese.png'];
  const captures = sprint3 ? [
    ['Controles · critério, situação e evidência', 'controles.png'],
    ['Evolução dos controles · checkpoints', 'evolucao.png'],
    ['Plano de ação · execução e conclusão', 'acoes.png'],
    ['Heatmap · risco inerente', 'risco-inerente.png'],
    ['Heatmap · risco residual', 'risco-residual.png'],
    ['Riscos · responsável, avaliação e tratamento', 'riscos.png'],
    ['Achados históricos · situação atual', 'vulnerabilidades.png'],
    ['Segurança · detecção e investigação', 'seguranca.png'],
    ['Eventos centralizados · API', 'logs.png'],
    ['Incidentes de segurança · cronologia', 'incidentes.png'],
    ['Indicadores Sprint 3 · cálculo e decisão', 'indicadores.png'],
    ['Disponibilidade assistencial · lacunas preservadas', 'operacao.png'],
  ] : [
    ['Baseline e tendências', 'baseline.png'],
    ['Riscos e plano de tratamento', 'riscos.png'],
    ['Inventário de vulnerabilidades', 'vulnerabilidades.png'],
    ['Incidentes · cronologia e resposta', 'incidentes.png'],
    ['Indicadores e decisão associada', 'indicadores.png'],
    ['Consulta assistencial agora', 'operacao.png'],
  ];
  for (const [title, filename] of captures) {
    if (sprint3) {
      const selected = servedPanels.find(p => p.title === title);
      assert.ok(selected, `Painel para captura ausente: ${title}`);
      // A focused panel keeps table rows visible and avoids dashboard lazy-layout overlays.
      await page.goto(dashboardUrl + (selected.type === 'row' ? '' : `&viewPanel=panel-${selected.id}`), { waitUntil: 'networkidle' });
    }
    await page.getByText(title, { exact: true }).evaluate(el => { el.style.scrollMarginTop = '90px'; el.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(1500);
    if (filename === 'indicadores.png') await page.setViewportSize({ width: 1366, height: 1500 });
    await page.screenshot({ path: join(output, filename) });
    if (filename === 'indicadores.png') await page.setViewportSize({ width: 1366, height: 1000 });
    screenshots.push(filename);
  }
  if (sprint3) await page.goto(dashboardUrl, { waitUntil: 'networkidle' });
  await page.getByText('CPU por contêiner · núcleos utilizados', { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(output, 'infraestrutura.png') });
  screenshots.push('infraestrutura.png');
  assert.deepEqual(errors, [], 'Todas as visões do dashboard devem abrir sem erros JavaScript');
  const result = { session_id: manifest?.session_id, source_manifest_sha256: manifestText ? createHash('sha256').update(manifestText).digest('hex') : undefined, captured_at: new Date().toISOString(), panels: servedPanels.length,
    range_start: new Date(from).toISOString(), range_end: new Date(to).toISOString(), range_seconds: rangeSeconds,
    analytical_queries: analyticalQueries, log_queries: logQueries, indicators: analysis.indicators.length, sprint3_indicators: sprint3?.indicators.length,
    expression_errors: failures, javascript_errors: errors, screenshots };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Grafana validado: login, dashboard, expressões e capturas em ${output}.`);
} finally { await browser.close(); }
