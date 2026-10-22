import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'output-dir': { type: 'string' } } });
assert.ok(positionals.length <= 1, 'Informe no máximo um início ISO.');
const output = resolve(values['output-dir'] ?? `evidence/runs/alerts-${Date.now()}`);

// Optional observer: captures real alerts; never induces failures or edits the dashboard.
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').trim().split('\n').map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
const browser = await chromium.launch({ headless: true });
const pending = new Set(['ConsultaAssistencialIndisponivel', 'FalhaDeColeta']);
const deadline = Date.now() + 70 * 60_000;
const observedSince = positionals[0] ? Date.parse(positionals[0]) : Date.now();
assert.ok(Number.isFinite(observedSince), 'Início de observação deve ser uma data ISO válida');
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, baseURL: 'http://localhost:3001' });
  async function authenticate() {
    const login = await context.request.post('/login', { data: { user: 'admin', password: env.GRAFANA_PASSWORD } });
    assert.equal(login.status(), 200, 'Login do Grafana deve funcionar');
  }
  await authenticate();
  while (pending.size && Date.now() < deadline) {
    const query = encodeURIComponent('ALERTS{alertstate="firing"}[1h]');
    const url = `/api/datasources/proxy/uid/prometheus/api/v1/query?query=${query}`;
    let response = await context.request.get(url);
    // Grafana may require an interactive token rotation after ten minutes.
    if (response.status() === 401) { await authenticate(); response = await context.request.get(url); }
    assert.ok(response.ok(), `Consulta de alertas retornou HTTP ${response.status()}`);
    const body = await response.json();
    for (const name of [...pending]) {
      const alerts = body.data.result.filter(item => item.metric.alertname === name)
        .map(item => ({ ...item, values: item.values.filter(sample => sample[0] * 1000 >= observedSince) }))
        .filter(item => item.values.length > 0);
      if (!alerts.length) continue;
      const end = Math.max(...alerts.flatMap(item => item.values.map(sample => sample[0] * 1000)));
      const start = Math.max(end - 3600_000, observedSince);
      const page = await context.newPage();
      await page.goto(`/d/saude-v01?from=${start}&to=${end}&kiosk`, { waitUntil: 'networkidle' });
      await page.getByText('Consulta assistencial agora', { exact: true }).waitFor();
      await page.waitForTimeout(3000);
      const folder = join(output, name);
      mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: join(folder, 'dashboard.png') });
      writeFileSync(join(folder, 'observation.json'), JSON.stringify({ captured_at: new Date().toISOString(),
        selected_alert_time: new Date(end).toISOString(), range_start: new Date(start).toISOString(),
        source: 'Histórico real do Prometheus; intervalo absoluto no Grafana', alerts }, null, 2) + '\n');
      await page.close();
      pending.delete(name);
      console.log(`Captura do histórico real salva: ${name} (${new Date(end).toISOString()})`);
    }
    if (pending.size) await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  assert.equal(pending.size, 0, 'Os dois cenários devem disparar alertas reais');
} finally { await browser.close(); }
