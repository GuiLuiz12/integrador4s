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
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, baseURL: 'http://localhost:3001' });
  const login = await context.request.post('/login', { data: { user: 'admin', password: env.GRAFANA_PASSWORD } });
  assert.equal(login.status(), 200, 'Login do Grafana deve funcionar');
  const definition = await context.request.get('/api/dashboards/uid/saude-v01');
  assert.equal(definition.status(), 200, 'Dashboard deve estar provisionado');
  const { dashboard } = await definition.json();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/d/saude-v01?from=${from}&to=${to}&kiosk`, { waitUntil: 'networkidle' });
  await page.getByText('Consulta assistencial agora', { exact: true }).waitFor();
  // Allow first data queries and canvas rendering to complete before capture.
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(output, 'sintese.png') });
  const failures = [];
  for (const panel of dashboard.panels) {
    for (const target of panel.targets ?? []) {
      const expr = target.expr?.replaceAll('$__range_s', String(rangeSeconds)).replaceAll('$__range', rangeDuration);
      if (!expr) continue;
      const query = new URLSearchParams({ query: expr, time: String(to / 1000) });
      const response = await context.request.get(`/api/datasources/proxy/uid/prometheus/api/v1/query?${query}`);
      const body = await response.json();
      if (!response.ok() || body.status !== 'success') failures.push({ panel: panel.title, error: body.error ?? response.status() });
    }
  }
  assert.deepEqual(failures, [], 'Todas as expressões do dashboard devem ser válidas');
  assert.deepEqual(errors, [], 'Dashboard deve abrir sem erros JavaScript');
  await page.getByText('CPU por contêiner · núcleos utilizados', { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(output, 'infraestrutura.png') });
  const result = { session_id: manifest?.session_id, source_manifest_sha256: manifestText ? createHash('sha256').update(manifestText).digest('hex') : undefined, captured_at: new Date().toISOString(), panels: dashboard.panels.length,
    range_start: new Date(from).toISOString(), range_end: new Date(to).toISOString(), range_seconds: rangeSeconds,
    expression_errors: failures, javascript_errors: errors, screenshots: ['sintese.png', 'infraestrutura.png'] };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Grafana validado: login, dashboard, expressões e capturas em ${output}.`);
} finally { await browser.close(); }
