import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
  for (const panel of expectedDashboard.panels.filter(p => p.targets?.some(t => t.scenarioId === 'csv_content'))) {
    assert.deepEqual(dashboard.panels.find(p => p.id === panel.id)?.targets, panel.targets, `Painel ${panel.title} deve usar os dados gerados atuais`);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/d/saude-v01?from=${from}&to=${to}&kiosk`, { waitUntil: 'networkidle' });
  await page.getByText('Riscos altos e críticos', { exact: true }).waitFor();
  // Allow first data queries and canvas rendering to complete before capture.
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(output, 'sintese.png') });
  const failures = [];
  let analyticalQueries = 0;
  for (const panel of dashboard.panels) {
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
        }
        continue;
      }
      const expr = target.expr?.replaceAll('$__range_s', String(rangeSeconds)).replaceAll('$__range', rangeDuration);
      if (!expr) continue;
      const query = new URLSearchParams({ query: expr, time: String(to / 1000) });
      const response = await context.request.get(`/api/datasources/proxy/uid/prometheus/api/v1/query?${query}`);
      const body = await response.json();
      if (!response.ok() || body.status !== 'success') failures.push({ panel: panel.title, error: body.error ?? response.status() });
    }
  }
  assert.deepEqual(failures, [], 'Todas as expressões do dashboard devem ser válidas');
  assert.ok(analyticalQueries >= 10, 'As visões analíticas devem estar presentes e fornecer dados');
  const screenshots = ['sintese.png'];
  for (const [title, filename] of [
    ['Baseline e tendências', 'baseline.png'],
    ['Riscos e plano de tratamento', 'riscos.png'],
    ['Inventário de vulnerabilidades', 'vulnerabilidades.png'],
    ['Incidentes · cronologia e resposta', 'incidentes.png'],
    ['Indicadores e decisão associada', 'indicadores.png'],
    ['Consulta assistencial agora', 'operacao.png'],
  ]) {
    await page.getByText(title, { exact: true }).evaluate(el => { el.style.scrollMarginTop = '90px'; el.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(1500);
    if (filename === 'indicadores.png') await page.setViewportSize({ width: 1366, height: 1500 });
    await page.screenshot({ path: join(output, filename) });
    if (filename === 'indicadores.png') await page.setViewportSize({ width: 1366, height: 1000 });
    screenshots.push(filename);
  }
  await page.getByText('CPU por contêiner · núcleos utilizados', { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(output, 'infraestrutura.png') });
  screenshots.push('infraestrutura.png');
  assert.deepEqual(errors, [], 'Todas as visões do dashboard devem abrir sem erros JavaScript');
  const reportPage = await context.newPage();
  const reportResponse = await reportPage.goto('http://localhost:3000/analysis/sprint2');
  assert.equal(reportResponse.status(), 200, 'Relatório deve estar acessível');
  assert.equal(await reportPage.locator('h2').count(), 10, 'Relatório deve conter as dez seções do modelo');
  await reportPage.screenshot({ path: join(output, 'relatorio.png') });
  const dataResponse = await context.request.get('http://localhost:3000/analysis/sprint2/data');
  assert.equal(dataResponse.status(), 200);
  const analysis = await dataResponse.json();
  assert.equal(await reportPage.locator('#sec8 tbody tr').count(), analysis.indicators.length, 'Todos os indicadores devem aparecer no relatório');
  assert.equal(await reportPage.locator('figure img').count(), analysis.figures.length, 'Capturas devem estar incorporadas no relatório');
  assert.ok(await reportPage.locator('figure img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), 'Capturas devem carregar sob a política CSP');
  assert.deepEqual(await reportPage.locator('a[href^="#"]').evaluateAll(links => links.map(a => a.getAttribute('href')).filter(href => !document.getElementById(href.slice(1)))), [], 'Índice e referências de capturas devem apontar para âncoras válidas');
  const embeddedImages = await reportPage.locator('figure img').evaluateAll(images => images.map(img => ({ id: img.parentElement.id, data: img.src.split(',')[1] })));
  for (const figure of analysis.figures) {
    const embedded = embeddedImages.find(image => image.id === figure.id);
    assert.ok(embedded, `Captura ${figure.id} deve estar incorporada`);
    assert.equal(createHash('sha256').update(Buffer.from(embedded.data, 'base64')).digest('hex'), figure.sha256, 'Captura incorporada deve preservar os bytes originais');
  }
  for (const [section, filename] of [['sec3','relatorio-baseline.png'],['sec5','relatorio-vulnerabilidades.png'],['sec7','relatorio-incidentes.png'],['sec8','relatorio-indicadores.png']]) {
    await reportPage.locator('#'+section).screenshot({ path: join(output, filename) });
    screenshots.push(filename);
  }
  for (const source of analysis.sources) {
    const response = await context.request.get(`http://localhost:3000/analysis/sprint2/source/${source.id}`);
    assert.equal(response.status(), 200, `Fonte ${source.id} deve estar acessível`);
    assert.equal(createHash('sha256').update(await response.body()).digest('hex'), source.sha256, `Fonte ${source.id} deve corresponder ao catálogo`);
  }
  screenshots.push('relatorio.png');
  const result = { session_id: manifest?.session_id, source_manifest_sha256: manifestText ? createHash('sha256').update(manifestText).digest('hex') : undefined, captured_at: new Date().toISOString(), panels: dashboard.panels.length,
    range_start: new Date(from).toISOString(), range_end: new Date(to).toISOString(), range_seconds: rangeSeconds,
    analytical_queries: analyticalQueries, report_sections: 10, indicators: analysis.indicators.length, figures_checked: analysis.figures.length,
    sources_checked: analysis.sources.length, expression_errors: failures, javascript_errors: errors, screenshots };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Grafana validado: login, dashboard, expressões e capturas em ${output}.`);
} finally { await browser.close(); }
