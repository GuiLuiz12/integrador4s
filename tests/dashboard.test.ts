import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const verifierModule = new URL('../scripts/verify-dashboard.mjs', import.meta.url).href;
const { expandExpression, dashboardUrl } = await import(verifierModule);
const definition = { templating: { list: [
  { name: 'servico', includeAll: true, allValue: '.*', current: { value: '$__all' } },
  { name: 'evento', includeAll: true, allValue: '.*', current: { value: '$__all' } },
  { name: 'correlacao', current: { value: '.*' } },
  { name: 'instancia', current: { value: '.*' } },
] } };

test('consultas usam o intervalo exato e o filtro escolhido, incluindo Todos', () => {
  const expression = 'sum(rate(metric{service=~"${servico:regex}"}[$__rate_interval])) / $__range_s';
  assert.equal(expandExpression(expression, definition, 1000, 61000), 'sum(rate(metric{service=~".*"}[1m])) / 60');
  assert.equal(expandExpression(expression, definition, 1000, 61000, { servico: 'api' }), 'sum(rate(metric{service=~"api"}[1m])) / 60');
  assert.equal(expandExpression('sum_over_time(metric[$__range])', definition, 1000, 2515), 'sum_over_time(metric[1515ms])');
  assert.throws(() => expandExpression('metric{job="$desconhecido"}', definition, 0, 60000), /não resolvida/);
});

test('correlação e instância mantêm aspas, barras e acentos graves fora da sintaxe LogQL', () => {
  const correlation = 'pedido-"\\-`';
  const expression = '${correlacao:percentencode}|${instancia:percentencode}';
  const expanded = expandExpression(expression, definition, 0, 60000, { evento: 'authentication', correlacao: correlation, instancia: 'instancia-1' });
  assert.equal(expanded, 'pedido-%22%5C-%60|instancia-1');
  assert.equal(expandExpression('${correlacao:percentencode}', definition, 0, 60000), '.%2A');
});

test('drill-down conserva período, kiosk e correlação codificada na URL', () => {
  const link = new URL(dashboardUrl('cypark-secops', 1000, 61000, { kiosk: true, panelId: 420, variables: { correlacao: 'req?&=1' } }), 'http://localhost:3001');
  assert.equal(link.pathname, '/d/cypark-secops');
  assert.equal(link.searchParams.get('from'), '1000');
  assert.equal(link.searchParams.get('to'), '61000');
  assert.equal(link.searchParams.get('kiosk'), 'true');
  assert.equal(link.searchParams.get('viewPanel'), 'panel-420');
  assert.equal(link.searchParams.get('var-correlacao'), 'req?&=1');
});

test('as duas visões são determinísticas e preservam os dados dos cenários', async () => {
  const modelModule = new URL('../scripts/dashboard-model.mjs', import.meta.url).href;
  const { buildDashboards, DASHBOARDS } = await import(modelModule);
  const sprint2 = JSON.parse(readFileSync(new URL('../analysis/sprint2/analysis.json', import.meta.url), 'utf8'));
  const sprint3 = JSON.parse(readFileSync(new URL('../analysis/sprint3/analysis.json', import.meta.url), 'utf8'));
  const originals = JSON.stringify([sprint2, sprint3]);
  const dashboards = buildDashboards(sprint2, sprint3);
  assert.deepEqual(dashboards, buildDashboards(sprint2, sprint3));
  assert.equal(JSON.stringify([sprint2, sprint3]), originals, 'A apresentação não altera análises preservadas');
  assert.equal(DASHBOARDS.executive.blocks.length, 8);
  assert.equal(DASHBOARDS.technical.blocks.length, 9);
  const response = dashboards.executive.panels.find((panel: { id: number }) => panel.id === 2);
  assert.match(response.targets[0].csvContent, /Clínico.*1/);
  assert.match(response.targets[0].csvContent, /Coleta.*1/);
  assert.match(response.targets[0].csvContent, /Login.*2/);
  const continuity = dashboards.executive.panels.find((panel: { id: number }) => panel.id === 5);
  const loginFailure = continuity.targets.find((target: { legendFormat: string }) => target.legendFormat === 'Login 503');
  assert.match(loginFailure.expr, /route="\/auth\/login"/);
  assert.doesNotMatch(loginFailure.expr, /traffic=/, 'Login indisponível antes de autenticar não possui tráfego clínico');
  const latency = dashboards.technical.panels.find((panel: { id: number }) => panel.id === 101);
  assert.match(latency.title, /bem-sucedidas/);
});
