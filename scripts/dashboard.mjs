import { readFileSync, writeFileSync } from 'node:fs';
import { sprint2Panels } from './dashboard-sprint2.mjs';

const datasource = { type: 'prometheus', uid: 'prometheus' };
let id = 0;
const panels = [];
function panel(title, type, x, y, w, h, expr, options = {}) {
  const { unit = 'short', thresholds, description = '', ...rest } = options;
  const result = { id: ++id, title, type, gridPos: { x, y, w, h }, description, datasource,
    fieldConfig: { defaults: { unit, noValue: 'Sem dados', thresholds: thresholds ?? { mode: 'absolute', steps: [{ color: 'green', value: null }] } }, overrides: [] },
    targets: expr ? [{ refId: 'A', expr, datasource, instant: type === 'stat', legendFormat: '{{job}}{{container_label_com_docker_compose_service}}{{alertname}}' }] : [],
    options: type === 'stat' ? { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } :
      { tooltip: { mode: 'multi' }, legend: { displayMode: 'list', placement: 'bottom' } }, ...rest };
  panels.push(result);
  return result;
}
const row = (title, y) => panels.push({ id: ++id, title, type: 'row', collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 } });
const lowBad = threshold => ({ mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: threshold }] });
const highBad = threshold => ({ mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: threshold }] });
const clinical = 'route="/prontuarios/:id",traffic="clinical"';
const volume = `sum(rate(clinical_requests_total{${clinical}}[5m]))`;
const p95 = `histogram_quantile(0.95, sum by(le) (rate(clinical_request_duration_seconds_bucket{${clinical}}[5m]))) and on() (sum(rate(clinical_request_duration_seconds_count{${clinical}}[5m])) > 0)`;
const errors = `100 * sum(rate(clinical_requests_total{${clinical},status=~"5.."}[5m])) / (${volume} > 0)`;
row('Síntese gerencial', 0);
const current = panel('Consulta assistencial agora', 'stat', 0, 1, 6, 4, 'lab:clinical_available', { thresholds: lowBad(1),
  description: 'Fluxo completo: login + leitura validada do prontuário. Ausência de coleta não é sucesso.' });
current.fieldConfig.defaults.mappings = [{ type: 'value', options: { 0: { text: 'Indisponível', color: 'red' }, 1: { text: 'Disponível', color: 'green' } } }];
panel('Disponibilidade observada · período', 'stat', 6, 1, 6, 4,
  '100 * avg_over_time(probe_success{job="probe"}[$__range])', { unit: 'percent', thresholds: lowBad(99),
    description: 'Sucessos / verificações observadas. Não é SLA mensal; avaliar lacunas abaixo.' });
panel('Cobertura da coleta agora', 'stat', 12, 1, 6, 4, 'lab:collection_coverage_percent', { unit: 'percent', thresholds: lowBad(100) });
panel('Alertas ativos', 'stat', 18, 1, 6, 4,
  'count(ALERTS{alertstate="firing"}) or (0 * max(up{job="prometheus"}))', { thresholds: highBad(1) });
id += 1; // Reserve the removed text panel's ID to keep existing panel links stable.
row('Qualidade da evidência e continuidade', 5);
panel('Verificações observadas · período', 'stat', 0, 6, 6, 4, 'count_over_time(probe_success{job="probe"}[$__range])');
panel('Verificações com sucesso · período', 'stat', 6, 6, 6, 4, 'sum_over_time(probe_success{job="probe"}[$__range])');
panel('Amostras observadas / esperadas · período', 'stat', 12, 6, 6, 4,
  'clamp_max(100 * count_over_time(probe_success{job="probe"}[$__range]) / ($__range_s / 15), 100)', { unit: 'percent', thresholds: lowBad(99),
    description: 'Estimativa de completude temporal, com bordas de coleta de 15 s. Selecionar o intervalo exato da sessão. Não confundir com cobertura dos alvos.' });
panel('Latência p95 · consultas · 5 min', 'stat', 18, 6, 6, 4, p95, { unit: 's', thresholds: highBad(0.500001) });
panel('Disponibilidade assistencial · lacunas preservadas', 'timeseries', 0, 10, 12, 7, 'lab:clinical_available');
panel('Coleta por alvo · 1 = coleta válida', 'timeseries', 12, 10, 12, 7, 'lab:target_up');
panel('Alertas · pendente e disparado', 'timeseries', 0, 17, 24, 6, 'ALERTS', {
  targets: [{ refId: 'A', datasource, expr: 'ALERTS', legendFormat: '{{alertname}} · {{job}} · {{alertstate}}' }],
  description: 'Séries presentes durante pendência/disparo; consultar a linha temporal da coleta para distinguir ausência de alerta de ausência de monitoramento.' });
row('Desempenho e eventos técnicos', 23);
panel('Consultas por segundo · 5 min', 'timeseries', 0, 24, 8, 7, volume, { unit: 'reqps' });
panel('Erros 5xx / respostas clínicas · 5 min', 'timeseries', 8, 24, 8, 7, errors, { unit: 'percent', thresholds: highBad(1) });
panel('Latência p95 · consultas bem-sucedidas', 'timeseries', 16, 24, 8, 7, p95, { unit: 's', thresholds: highBad(0.500001) });
panel('Falhas de autenticação · período', 'stat', 0, 31, 8, 4,
  'sum(increase(clinical_auth_failures_total[$__range]))', { description: 'Estimativa por contador Prometheus; consulte os logs para a contagem exata dos eventos.' });
panel('Carga configurada · consultas/s', 'timeseries', 8, 31, 8, 4, 'lab_load_rate');
panel('Duração da verificação completa', 'timeseries', 16, 31, 8, 4, 'probe_duration_seconds', { unit: 's' });
row('Infraestrutura · host inclui processos externos ao projeto', 35);
panel('CPU do host', 'timeseries', 0, 36, 8, 7, '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))', { unit: 'percent' });
panel('Memória do host', 'timeseries', 8, 36, 8, 7, '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)', { unit: 'percent' });
panel('Disco do host · raiz', 'timeseries', 16, 36, 8, 7, '100 * (1 - node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"})', { unit: 'percent' });
const containers = 'container_label_com_docker_compose_project="governanca-saude",container_label_com_docker_compose_service!=""';
panel('CPU por contêiner · núcleos utilizados', 'timeseries', 0, 43, 12, 7,
  `sum by(container_label_com_docker_compose_service) (rate(container_cpu_usage_seconds_total{${containers}}[5m]))`);
panel('Memória por contêiner', 'timeseries', 12, 43, 12, 7,
  `sum by(container_label_com_docker_compose_service) (container_memory_working_set_bytes{${containers}})`, { unit: 'bytes' });
panel('Uptime do host', 'stat', 0, 50, 8, 4, 'time() - node_boot_time_seconds', { unit: 's' });
panel('Atividade de rede por contêiner · bytes/s', 'timeseries', 8, 50, 16, 6,
  `sum by(container_label_com_docker_compose_service) (rate(container_network_receive_bytes_total{${containers}}[5m]) + rate(container_network_transmit_bytes_total{${containers}}[5m]))`, { unit: 'Bps' });
for (const item of panels) {
  if (item.type === 'timeseries' && /Disponibilidade assistencial|Coleta por alvo/.test(item.title)) {
    item.fieldConfig.defaults.min = 0;
    item.fieldConfig.defaults.max = 1;
  }
}
const analysis = JSON.parse(readFileSync(new URL('../analysis/sprint2/analysis.json', import.meta.url), 'utf8'));
const analytical = sprint2Panels(analysis);
for (const item of panels) item.gridPos.y += analytical.height;
panels[0].title = 'Operação · intervalo selecionado';
const dashboard = { uid: 'saude-v01', title: 'Governança em Cibersegurança · Saúde v0.2', tags: ['saude', 'sprint-2'],
  schemaVersion: 39, version: 2, editable: false, timezone: 'America/Sao_Paulo', refresh: '15s',
  time: { from: 'now-1h', to: 'now' }, panels: [...analytical.panels, ...panels], templating: { list: [] },
  annotations: { list: [{ builtIn: 1, datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, name: 'Annotations & Alerts', type: 'dashboard' }] } };
writeFileSync(new URL('../dashboards/saude.json', import.meta.url), JSON.stringify(dashboard, null, 2) + '\n');
console.log('Dashboard provisionado gerado.');
