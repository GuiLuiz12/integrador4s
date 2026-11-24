import { sprint2Panels } from './dashboard-sprint2.mjs';
import { sprint3Panels } from './dashboard-sprint3.mjs';

export const COLORS = { cyan: '#00E5E5', lavender: '#C49AFF', green: '#73BF69', yellow: '#FADE2A', red: '#F2495C', critical: '#C4162A', gray: '#8E8E8E' };
export const IDS = { alerts: 110, logs: 114, fullLogs: 420, controls: 401, evolution: 402, actions: 403, indicators: 404, risks: 405, residual: 406, vulnerabilities: 407, incidents: 421, comparison: 422, evidence: 423 };
export const DASHBOARDS = {
  executive: { uid: 'saude-v01', file: 'saude.json', blocks: [
    { id: 'availability', title: 'Disponibilidade assistencial', panelIds: [1] },
    { id: 'response', title: 'Resposta a incidentes', panelIds: [2] },
    { id: 'login', title: 'Falhas de login', panelIds: [3] },
    { id: 'risk', title: 'Exposição de riscos', panelIds: [4] },
    { id: 'continuity', title: 'Continuidade clínica', panelIds: [5] },
    { id: 'exposure', title: 'Ativos mais expostos', panelIds: [6] },
    { id: 'matrix', title: 'Matriz de risco inerente', panelIds: [7] },
    { id: 'actions', title: 'Plano de mitigação priorizado', panelIds: [8] },
  ], details: [] },
  technical: { uid: 'cypark-secops', file: 'secops.json', blocks: [
    { id: 'performance', title: 'Latência p95 e erros 5xx', panelIds: [101, 102] },
    { id: 'throughput', title: 'Vazão e tráfego da API', panelIds: [103, 104] },
    { id: 'app', title: 'Capacidade APP-01', panelIds: [107] },
    { id: 'database', title: 'Capacidade DB-01', panelIds: [108] },
    { id: 'host', title: 'Capacidade HOST-01', panelIds: [109] },
    { id: 'collection', title: 'Cobertura da coleta', panelIds: [105, 106] },
    { id: 'alerts', title: 'Alertas e incidentes', panelIds: [110, 111] },
    { id: 'vulnerabilities', title: 'Vulnerabilidades', panelIds: [112] },
    { id: 'logs', title: 'Autenticação e logs', panelIds: [113, 114, 115] },
  ], details: [
    { id: 'controls', title: 'Controles · critério, situação e evidência', panelId: 401, expectedRows: 10 },
    { id: 'evolution', title: 'Evolução dos controles · checkpoints', panelId: 402, expectedRows: 2 },
    { id: 'actions', title: 'Plano de ação · execução e conclusão', panelId: 403, expectedRows: 10 },
    { id: 'indicators', title: 'Indicadores Sprint 3 · cálculo e decisão', panelId: 404, expectedRows: 12 },
    { id: 'risks', title: 'Riscos · responsável, avaliação e tratamento', panelId: 405, expectedRows: 5 },
    { id: 'residual', title: 'Heatmap · risco residual', panelId: 406, expectedRows: 5 },
    { id: 'vulnerabilities', title: 'Achados históricos · situação atual', panelId: 407, expectedRows: 5 },
    { id: 'logs', title: 'Eventos centralizados · API', panelId: 420 },
    { id: 'incidents', title: 'Incidentes de segurança · cronologia', panelId: 421, expectedRows: 2 },
    { id: 'incident-overview', title: 'Timelines · clínico, coleta e autenticação', panelId: 425, expectedRows: 4 },
    { id: 'comparison', title: 'Evolução entre execuções · mesma categoria', panelId: 422, expectedRows: 2 },
    { id: 'historical-indicators', title: 'Histórico Sprint 2 · Indicadores e decisão associada', panelId: 1500, expectedRows: 18 },
  ] },
};
const prometheus = { type: 'prometheus', uid: 'prometheus' };
const loki = { type: 'loki', uid: 'loki' };
const analytical = { type: 'grafana-testdata-datasource', uid: 'sprint2-analysis' };
const clinical = 'route="/prontuarios/:id",traffic="clinical"';
const group = 'container_label_com_docker_compose_service';
const project = 'container_label_com_docker_compose_project="governanca-saude"';
const sourceIds = refs => [...new Set((refs ?? []).map(r => r.source))].join(', ');
const round = value => value == null ? null : Number(value.toFixed(2));
const localDate = value => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const noData = [{ type: 'special', options: { match: 'null', result: { text: 'Sem dados', color: COLORS.gray } } }];
const thresholds = steps => ({ mode: 'absolute', steps: steps.map(([value, color]) => ({ value, color })) });
const fixed = color => ({ mode: 'fixed', fixedColor: color });

export function dashboardLink(uid, panelId) {
  return '/d/' + uid + '?${__url_time_range}&${__all_variables}&kiosk=true' + (panelId ? '&viewPanel=panel-' + panelId : '');
}
function navigate(panel, title, panelId, uid = 'cypark-secops') {
  const url = dashboardLink(uid, panelId);
  panel.links = [{ title, url, targetBlank: false }];
  if (['stat', 'gauge'].includes(panel.type)) panel.fieldConfig.defaults.links = [{ title, url, targetBlank: false }];
  return panel;
}
function base(id, title, type, x, y, w, h) {
  return { id, title, type, gridPos: { x, y, w, h },
    fieldConfig: { defaults: { unit: 'short', decimals: 2, noValue: 'Sem dados', mappings: structuredClone(noData), color: fixed(COLORS.cyan) }, overrides: [] }, options: {}, targets: [] };
}
function csv(headers, rows) {
  return [headers, ...rows].map(row => row.map(value => value == null ? '' : '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
}
function data(panel, headers, rows) {
  panel.datasource = analytical;
  panel.fieldConfig.defaults.mappings = [];
  panel.targets = [{ refId: 'A', datasource: analytical, scenarioId: 'csv_content', csvContent: csv(headers, rows) }];
  return panel;
}
function table(id, title, x, y, w, h, headers, rows, widths = {}) {
  const p = data(base(id, title, 'table', x, y, w, h), headers, rows);
  p.options = { showHeader: true, cellHeight: 'sm', footer: { show: false } };
  p.fieldConfig.defaults.custom = { minWidth: 40, align: 'auto', wrapText: true, wrapHeaderText: true, cellOptions: { type: 'auto' }, inspect: false };
  p.fieldConfig.overrides = Object.entries(widths).map(([name, width]) => ({ matcher: { id: 'byName', options: name }, properties: [{ id: 'custom.width', value: width }] }));
  return p;
}
function field(panel, name, properties) {
  panel.fieldConfig.overrides.push({ matcher: { id: 'byName', options: name }, properties: Object.entries(properties).map(([id, value]) => ({ id, value })) });
}
function statusField(panel, name, states) {
  field(panel, name, { mappings: [{ type: 'value', options: Object.fromEntries(Object.entries(states).map(([text, color]) => [text, { text, color }])) }], 'custom.cellOptions': { type: 'color-text' } });
}
function text(id, title, x, y, w, h, content) {
  const p = base(id, title, 'text', x, y, w, h);
  p.options = { mode: 'markdown', content }; p.transparent = true;
  return p;
}
function series(id, title, x, y, w, h, queries, unit = 'short') {
  const p = base(id, title, 'timeseries', x, y, w, h);
  p.datasource = prometheus;
  p.targets = queries.map(([legendFormat, expr], i) => ({ refId: String.fromCharCode(65 + i), datasource: prometheus, expr, legendFormat, range: true, instant: false }));
  p.fieldConfig.defaults.unit = unit;
  p.fieldConfig.defaults.mappings = [];
  p.fieldConfig.defaults.custom = { drawStyle: 'line', lineInterpolation: 'linear', lineWidth: 2, fillOpacity: 7, gradientMode: 'opacity',
    showPoints: 'never', spanNulls: false, insertNulls: false, axisPlacement: 'auto', axisColorMode: 'text',
    hideFrom: { legend: false, tooltip: false, viz: false }, thresholdsStyle: { mode: 'off' } };
  p.options = { tooltip: { mode: 'multi' }, legend: { displayMode: 'list', placement: 'bottom', calcs: [] } };
  p.description = 'Operação no período selecionado. Lacunas preservadas; ausência de dados não representa normalidade.';
  return p;
}
function stat(id, title, x, y, w, h, expr, unit = 'short') {
  const p = base(id, title, 'stat', x, y, w, h);
  p.datasource = prometheus; p.targets = [{ refId: 'A', datasource: prometheus, expr, instant: true }];
  p.fieldConfig.defaults.unit = unit;
  p.options = { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none', textMode: 'auto', justifyMode: 'center' };
  return p;
}
function limit(panel, value) {
  panel.fieldConfig.defaults.thresholds = thresholds([[null, COLORS.green], [value, COLORS.yellow]]);
  panel.fieldConfig.defaults.custom.thresholdsStyle = { mode: 'line' };
}
function matrix(id, title, x, y, w, h, risks, assessment) {
  const rows = [5, 4, 3, 2, 1].map(p => ['P ' + p, ...[1, 2, 3, 4, 5].map(i => {
    const matches = risks.filter(r => r[assessment].probability === p && r[assessment].impact === i);
    return matches.length ? matches.map(r => r.id).join(' / ') : '—';
  })]);
  const panel = table(id, title, x, y, w, h, ['P ↓ / I →', '1', '2', '3', '4', '5'], rows, { 'P ↓ / I →': 76 });
  panel.fieldConfig.defaults.decimals = 0;
  for (const i of [1, 2, 3, 4, 5]) {
    const mappings = { '—': { text: '—', color: 'transparent' } };
    for (const row of rows) {
      const score = Number(row[0].slice(2)) * i;
      if (row[i] !== '—') mappings[row[i]] = { text: row[i], color: score >= 17 ? COLORS.critical : score >= 10 ? COLORS.red : score >= 5 ? COLORS.yellow : COLORS.green };
    }
    field(panel, String(i), { mappings: [{ type: 'value', options: mappings }], 'custom.cellOptions': { type: 'color-background', mode: 'basic' }, 'custom.align': 'center' });
  }
  panel.description = 'Avaliação qualitativa P × I (1–5). Baixo 1–4; moderado 5–9; alto 10–16; crítico 17–25. Células vazias não possuem riscos. Melhorar detecção não reduz automaticamente o risco residual.';
  return panel;
}
export function containerQueries(service) {
  const selector = project + ',' + group + '=~"' + service + '"';
  const active = 'container_last_seen{' + selector + '} > (time() - 60)';
  // Match each current container before aggregating; old instances must not inflate usage.
  const cpu = 'sum by (' + group + ') (rate(container_cpu_usage_seconds_total{' + selector + '}[5m]) and on(id,instance) (' + active + '))';
  const quota = 'sum by (' + group + ') ((container_spec_cpu_quota{' + selector + '} / container_spec_cpu_period{' + selector + '}) and on(id,instance) (' + active + '))';
  const memory = 'sum by (' + group + ') (container_memory_working_set_bytes{' + selector + '} and on(id,instance) (' + active + '))';
  const memoryLimit = 'sum by (' + group + ') (container_spec_memory_limit_bytes{' + selector + '} and on(id,instance) (' + active + '))';
  return { cpu: '100 * (' + cpu + ') / (' + quota + ' > 0)', memory: '100 * (' + memory + ') / (' + memoryLimit + ' > 0)' };
}
function variables(hidden = false) {
  const choice = (name, label, values, description) => ({
    name, label, description, type: 'custom', query: values.join(','), includeAll: true, allValue: '.*', multi: false,
    current: { text: 'All', value: '$__all' }, hide: hidden ? 2 : 0, skipUrlSync: false,
    options: [{ text: 'All', value: '$__all', selected: true }, ...values.map(value => ({ text: value, value, selected: false }))],
  });
  return [
    choice('servico', 'Serviço · infraestrutura', ['api', 'postgres', 'lab', 'prometheus', 'grafana', 'node-exporter', 'cadvisor', 'loki', 'alloy'], 'Filtra somente a infraestrutura completa. APP-01, DB-01 e HOST-01 permanecem comparáveis.'),
    choice('evento', 'Evento · logs API', ['authentication', 'record_access', 'request_error'], 'Filtra logs da API; não altera métricas nem registros históricos.'),
    { name: 'correlacao', label: 'Correlação · logs', description: 'ID literal ou .* para todos. O detalhe preserva service, instance_id e correlation_id.', type: 'textbox', query: '.*', current: { text: '.*', value: '.*' }, options: [], hide: hidden ? 2 : 0, skipUrlSync: false },
    { name: 'instancia', label: 'Instância · logs', type: 'textbox', query: '.*', current: { text: '.*', value: '.*' }, options: [], hide: 2, skipUrlSync: false },
  ];
}
// Encode textbox values before interpolation: quotes, slashes and backticks stay data.
// These comparison labels exist only in the query and are removed from its result.
export const LOG_QUERY = '{service="api",event=~"${evento:regex}"} | json | label_format cypark_correlation=`{{ or (eq "${correlacao:percentencode}" ".%2A") (eq (urlquery .correlation_id) "${correlacao:percentencode}") }}`, cypark_instance=`{{ or (eq "${instancia:percentencode}" ".%2A") (eq (urlquery .instance_id) "${instancia:percentencode}") }}` | cypark_correlation="true" and cypark_instance="true" | drop cypark_correlation,cypark_instance';
function logs(id, title, x, y, w, h, maxLines) {
  const p = base(id, title, 'logs', x, y, w, h);
  p.datasource = loki; p.targets = [{ refId: 'A', datasource: loki, expr: LOG_QUERY, queryType: 'range', maxLines }];
  p.options = { showTime: true, showLabels: false, showCommonLabels: false, wrapLogMessage: true, prettifyLogMessage: false, enableLogDetails: true, sortOrder: 'Descending', dedupStrategy: 'none' };
  p.description = 'Eventos estruturados no período. Fonte: API. Correlação = service + instance_id + correlation_id. Visualização limitada a ' + maxLines + ' linhas recentes; a exportação paginada permanece nos comandos existentes. Não somar request_error à resposta correspondente.';
  return p;
}
function collapse(id, title, panels, y) {
  const children = structuredClone(panels), firstY = Math.min(...panels.map(p => p.gridPos.y));
  for (const p of children) p.gridPos.y += y + 1 - firstY;
  return { id, title, type: 'row', collapsed: true, gridPos: { x: 0, y, w: 24, h: 1 }, panels: children };
}
function dashboard(uid, title, panels, hiddenVariables) {
  return { uid, title, tags: ['cypark', 'saude', 'sprint-3'], schemaVersion: 39, version: 4, editable: false,
    timezone: 'America/Sao_Paulo', refresh: '15s', time: { from: 'now-1h', to: 'now' }, graphTooltip: 1, panels, templating: { list: variables(hiddenVariables) },
    links: [{ title: uid === 'saude-v01' ? 'Drill-down técnico' : 'Visão executiva', type: 'link', url: dashboardLink(uid === 'saude-v01' ? 'cypark-secops' : 'saude-v01'), icon: 'external link', targetBlank: false }],
    annotations: { list: [{ builtIn: 1, datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, name: 'Annotations & Alerts', type: 'dashboard' }] } };
}

export function buildDashboards(s2, s3) {
  const executive = [], technical = [], c = s3.counts;
  const date = localDate(s3.assessed_at), checkpoint = 'Avaliação preservada em ' + date + '. O seletor de tempo não altera estes registros.';
  const rate = selector => 'sum(rate(clinical_requests_total{' + selector + '}[5m]))';
  const volume = rate(clinical);
  const p95 = 'histogram_quantile(0.95, sum by(le) (rate(clinical_request_duration_seconds_bucket{' + clinical + '}[5m]))) and on() (sum(rate(clinical_request_duration_seconds_count{' + clinical + '}[5m])) > 0)';
  const errors = '100 * ' + rate(clinical + ',status=~"5.."') + ' / (' + volume + ' > 0)';
  const login = 'sum(increase(clinical_auth_failures_total{stage="login"}[1m])) and on() (up{job="api"} == 1)';
  executive.push(text(90, '', 0, 0, 24, 2, '**CyPark · Governança Executiva** · [Drill-down técnico →](' + dashboardLink('cypark-secops') + ') · Operação: período selecionado · Avaliação: **' + date + '** · Ensaios datados por cenário.'));
  const availability = stat(1, 'Disponibilidade assistencial', 0, 2, 6, 6, '(100 * avg_over_time(probe_success{job="probe"}[$__range])) and on() (up{job="probe"} == 1)', 'percent');
  availability.type = 'gauge'; availability.options = { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, orientation: 'auto', showThresholdLabels: false, showThresholdMarkers: true, minVizWidth: 75, minVizHeight: 75, sizing: 'auto' };
  Object.assign(availability.fieldConfig.defaults, { displayName: 'Fluxo autenticado · meta ≥99%', min: 0, max: 100, decimals: 2, color: { mode: 'thresholds' }, thresholds: thresholds([[null, COLORS.red], [99, COLORS.green]]) });
  availability.description = 'Meta didática ≥99%. Sucessos / verificações observadas do fluxo autenticado (login + consulta + banco). Não é SLA mensal. Sem coleta atual: Sem dados; avaliar lacunas no painel técnico.';
  executive.push(navigate(availability, 'Investigar disponibilidade e coleta', 106));
  const responseRows = [...s2.incidents.map(i => [i.id === 'INC-01' ? 'Clínico (1)' : 'Coleta (1)', round(i.detection_seconds), round(i.recovery_seconds), localDate(i.onset)]),
    ['Login (' + c.security_samples + ')', round(c.mttd_seconds), round(c.mttr_seconds), localDate(s3.incidents[0].onset)]];
  const response = table(2, 'Resposta · ensaios', 6, 2, 6, 6, ['Cenário (n)', 'MTTD (s)', 'MTTR (s)', 'Data'], responseRows, { 'Cenário (n)': 94, 'MTTD (s)': 62, 'MTTR (s)': 62, 'Data': 82 });
  response.description = 'Ensaios separados por categoria e amostra. MTTD: início → disparo. MTTR: disparo → recuperação confirmada; login exige também 60 s sem novas falhas. Não agregar como SLA comum.';
  executive.push(navigate(response, 'Abrir timelines e fórmulas', 425));
  const failures = stat(3, 'Falhas de login · 1 min', 12, 2, 6, 6, login);
  Object.assign(failures.fieldConfig.defaults, { decimals: 1, color: { mode: 'thresholds' }, thresholds: thresholds([[null, COLORS.green], [5, COLORS.yellow]]) });
  failures.description = 'Estimativa em 1 min. Alerta ≥5/min durante 15 s. Apenas stage=login; tokens inválidos não entram. Confirmar eventos, sem atribuir atacante ou invasão.';
  executive.push(navigate(failures, 'Investigar falhas de login', IDS.fullLogs));
  const risks = table(4, 'Exposição de riscos', 18, 2, 6, 6, ['Nível', 'Riscos'],
    ['Crítico', 'Alto', 'Moderado', 'Baixo'].map(level => [level, s3.risks.filter(r => r.inherent.level === level).length]).filter(([, n]) => n), { Nível: 150, Riscos: 80 });
  risks.fieldConfig.defaults.decimals = 0; statusField(risks, 'Nível', { Crítico: COLORS.red, Alto: COLORS.red, Moderado: COLORS.yellow, Baixo: COLORS.green });
  risks.description = checkpoint + ' Distribuição inerente; avaliação residual conservadora mantém P/I.';
  executive.push(navigate(risks, 'Comparar risco residual e tratamentos', IDS.risks));
  const continuity = series(5, 'Continuidade clínica · por rota', 0, 8, 10, 8, [['Consultas 2xx', rate(clinical + ',status=~"2.."')], ['Consultas 5xx', rate(clinical + ',status=~"5.."')], ['Login 503', '(' + rate('route="/auth/login",status="503"') + ') or on() (0 * ' + rate('route="/auth/login"') + ')']], 'reqps');
  field(continuity, 'Consultas 2xx', { color: fixed(COLORS.green) }); field(continuity, 'Consultas 5xx', { color: fixed(COLORS.red) }); field(continuity, 'Login 503', { color: fixed(COLORS.yellow) });
  continuity.description += ' Consultas clínicas e autenticação são séries distintas. Login 503 inclui falhas antes da identificação do tráfego.';
  executive.push(navigate(continuity, 'Investigar latência e erros', 101));
  const assets = [...new Set(s2.vulnerabilities.map(v => v.asset))].sort((a, b) => s2.vulnerabilities.filter(v => v.asset === b).length - s2.vulnerabilities.filter(v => v.asset === a).length);
  const exposure = data(base(6, 'Ativos mais expostos', 'barchart', 10, 8, 7, 8), ['Ativo', 'Alta', 'Média'], assets.map(asset => [asset, ...['Alta', 'Média'].map(severity => s2.vulnerabilities.filter(v => v.asset === asset && v.severity === severity).length)]));
  exposure.options = { xField: 'Ativo', orientation: 'horizontal', stacking: 'normal', showValue: 'auto', groupWidth: 0.6, barWidth: 0.85, legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } };
  Object.assign(exposure.fieldConfig.defaults, { min: 0, decimals: 0 }); field(exposure, 'Alta', { color: fixed(COLORS.red) }); field(exposure, 'Média', { color: fixed(COLORS.yellow) });
  exposure.description = 'Achados históricos da Sprint 2. Contagem sem score artificial. Exposição considera severidade, acesso e dependência: APP-01 concentra acesso clínico; DB-01 sustenta continuidade.';
  executive.push(navigate(exposure, 'Achados, evidências e tratamento', IDS.vulnerabilities));
  const inherent = matrix(7, 'Risco inerente · P × I', 17, 8, 7, 8, s3.risks, 'inherent'); inherent.description += ' ' + checkpoint;
  executive.push(navigate(inherent, 'Comparar avaliação residual', IDS.residual));
  const priorities = table(8, 'Mitigação · ' + c.risks_with_treatment_percent + '% com plano · ' + c.actions_completed + '/' + c.actions_total + ' ações concluídas', 0, 16, 24, 8,
    ['Prioridade', 'Ação pendente', 'Responsável', 'Prazo', 'Situação'], s3.actions.filter(a => a.status !== 'Concluída').map(a => [a.priority, a.action, a.owner, 'D+' + a.deadline_days, a.status]),
    { Prioridade: 95, Responsável: 185, Prazo: 75, Situação: 120 });
  priorities.description = checkpoint + ' Pendências priorizadas; prazos após aprovação, sem data presumida. Plano definido não significa mitigação concluída.';
  statusField(priorities, 'Situação', { Planejada: COLORS.yellow, Concluída: COLORS.green });
  executive.push(navigate(priorities, 'Plano completo e controles', IDS.actions));
  return buildTechnical(executive, technical, s2, s3, { date, volume, p95, errors });
}

function buildTechnical(executive, technical, s2, s3, { date, volume, p95, errors }) {
  const c = s3.counts;
  technical.push(text(100, '', 0, 0, 24, 2, '**CyPark · Operação & SecOps** · [← Executiva](' + dashboardLink('saude-v01') + ') · Operação: período selecionado · Avaliação: **' + date + '** · Filtros: infraestrutura completa e logs API.'));
  const latency = series(101, '01 · p95 bem-sucedidas · ≤500 ms', 0, 2, 8, 5, [['p95 · sucesso', p95]], 's'); limit(latency, 0.5);
  latency.fieldConfig.defaults.custom.axisSoftMin = 0;
  latency.fieldConfig.defaults.custom.axisSoftMax = 0.5;
  latency.description += ' Histograma somente em HTTP 200. Meta ≤500 ms. Interpretar junto aos erros 5xx no mesmo período.';
  technical.push(latency);
  const errorPanel = series(102, '01 · Erros clínicos 5xx · limiar <1%', 0, 7, 8, 5, [['Erros 5xx', errors]], 'percent'); limit(errorPanel, 1);
  errorPanel.fieldConfig.defaults.custom.axisSoftMin = 0;
  errorPanel.fieldConfig.defaults.custom.axisSoftMax = 2;
  field(errorPanel, 'Erros 5xx', { color: fixed(COLORS.red) }); technical.push(errorPanel);
  technical.push(series(103, '02 · Vazão da API · consultas/s', 8, 2, 8, 5, [['Consultas/s', volume]], 'reqps'));
  technical.push(series(104, '02 · Tráfego da API · rede', 8, 7, 8, 5,
    [['Recebido + enviado', 'sum(rate(container_network_receive_bytes_total{' + project + ',' + group + '="api"}[5m]) + rate(container_network_transmit_bytes_total{' + project + ',' + group + '="api"}[5m]))']], 'Bps'));
  const coverageStat = stat(105, '06 · Coleta atual · nove alvos', 16, 2, 8, 3, '(sum(lab:target_up) / count(lab:target_expected) * 100) and on() (up{job="prometheus"} == 1)', 'percent');
  Object.assign(coverageStat.fieldConfig.defaults, { decimals: 0, color: { mode: 'thresholds' }, thresholds: thresholds([[null, COLORS.yellow], [100, COLORS.green]]) });
  coverageStat.description = 'Inventário atual: nove alvos. Mede coleta, não disponibilidade funcional. Ausência de observação é Sem dados.';
  technical.push(coverageStat);
  const coverage = series(106, '06 · Cobertura · período selecionado', 16, 5, 8, 7, [['Coleta (%)', 'lab:collection_coverage_percent']], 'percent');
  Object.assign(coverage.fieldConfig.defaults, { min: 0, max: 100 }); coverage.fieldConfig.defaults.custom.lineInterpolation = 'stepAfter';
  field(coverage, 'Coleta (%)', { color: fixed(COLORS.green) }); technical.push(coverage);
  for (const [id, service, title, x] of [[107, 'api', '03 · Capacidade · APP-01', 0], [108, 'postgres', '04 · Capacidade · DB-01', 8]]) {
    const q = containerQueries(service), p = series(id, title, x, 12, 8, 8, [['CPU / limite', q.cpu], ['Memória / limite', q.memory]], 'percent');
    Object.assign(p.fieldConfig.defaults, { min: 0, max: 100 }); field(p, 'Memória / limite', { color: fixed(COLORS.lavender) }); limit(p, 80);
    p.description += ' CPU relativa à quota/período cAdvisor; memória working set relativa ao limite configurado. Limiar preventivo 80%.';
    technical.push(p);
  }
  const host = series(109, '05 · Capacidade · HOST-01', 16, 12, 8, 8,
    [['CPU do host', '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))'], ['Memória do host', '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)']], 'percent');
  Object.assign(host.fieldConfig.defaults, { min: 0, max: 100 }); limit(host, 80); field(host, 'Memória do host', { color: fixed(COLORS.lavender) });
  host.description += ' Percentuais da capacidade do host, incluindo processos externos ao projeto.'; technical.push(host);
  const alerts = series(110, '07 · Alertas · pendente e disparado', 0, 20, 8, 6,
    [['{{alertname}} · {{alertstate}}', 'ALERTS{alertname=~"ConsultaAssistencialIndisponivel|FalhaDeColeta|FalhasDeLoginRepetidas"}']]);
  alerts.type = 'state-timeline'; alerts.options = { showValue: 'never', mergeValues: true, alignValue: 'left', rowHeight: 0.75, legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } };
  alerts.fieldConfig.defaults.color = fixed(COLORS.gray);
  alerts.fieldConfig.defaults.custom = { lineWidth: 0, fillOpacity: 85, spanNulls: false, insertNulls: false, hideFrom: { legend: false, tooltip: false, viz: false } };
  for (const state of ['pending', 'firing']) alerts.fieldConfig.overrides.push({ matcher: { id: 'byRegexp', options: '.*' + state + '.*' }, properties: [{ id: 'color', value: fixed(state === 'firing' ? COLORS.red : COLORS.yellow) }] });
  alerts.description = 'Séries reais ALERTS: amarelo pending, vermelho firing. Lacunas não comprovam normalidade: conferir coleta.';
  technical.push(navigate(alerts, 'Detalhar timelines preservadas', 425));
  const incidentCounts = table(111, '07 · Incidentes · ensaios preservados', 0, 26, 8, 5, ['Cenário / data', 'Abertos', 'Fechados'],
    [...s2.incidents.map(i => [localDate(i.onset) + (i.id === 'INC-01' ? ' · Clínico' : ' · Coleta'), i.status === 'Fechado' ? 0 : 1, i.status === 'Fechado' ? 1 : 0]),
      [localDate(s3.incidents[0].onset) + ' · Login', c.incidents_open, c.incidents_closed]], { Abertos: 70, Fechados: 80 });
  incidentCounts.fieldConfig.defaults.decimals = 0; incidentCounts.description = 'Situação final dos ensaios, não registro de incidentes atuais. Tempos separados por categoria.';
  technical.push(navigate(incidentCounts, 'Cronologia e evidências', 425));
  const high = s2.vulnerabilities.filter(v => v.severity === 'Alta').length, medium = s2.vulnerabilities.filter(v => v.severity === 'Média').length;
  const vulns = table(112, '08 · Vulnerabilidades · ' + high + ' altas / ' + medium + ' médias', 8, 20, 8, 11, ['ID', 'Ativo', 'Severidade', 'Fonte'],
    s2.vulnerabilities.map(v => [v.id, v.asset, v.severity, sourceIds(v.technical_evidence)]), { ID: 80, Ativo: 75, Severidade: 90 });
  statusField(vulns, 'Severidade', { Alta: COLORS.red, Média: COLORS.yellow }); vulns.description = 'Revisão estática da Sprint 2; fontes preservadas e situação atual no detalhe. Não são resultados de scanner de CVEs.';
  technical.push(navigate(vulns, 'Achados e sustentação técnica', IDS.vulnerabilities));
  const auth = series(113, '09 · Autenticação · 401 no login/min', 16, 20, 8, 4, [['401 / min (estimativa)', 'sum(increase(clinical_auth_failures_total{stage="login"}[1m]))']]);
  auth.description += ' Contador stage=login. Contagem exata: eventos authentication com status 401; tokens recusados são outra etapa.';
  technical.push(navigate(auth, 'Investigar eventos por correlação', IDS.fullLogs));
  technical.push(navigate(logs(114, '09 · Eventos centralizados · API', 16, 24, 8, 4, 30), 'Abrir logs e correlação', IDS.fullLogs));
  technical.push(text(115, '', 16, 28, 8, 3, '**Registros:** Docker **10 MB × 3** · Loki **7 dias** configurados.\n\nNão são volume medido nem sete dias observados. [Investigar correlação →](' + dashboardLink('cypark-secops', IDS.fullLogs) + ')'));

  const originalS3 = sprint3Panels(s3).panels;
  function detail(title, id, y, h) {
    const found = originalS3.find(p => p.title === title);
    if (!found) throw new Error('Detalhe ausente: ' + title);
    const p = structuredClone(found); p.id = id; p.gridPos = { x: 0, y, w: 24, h };
    p.fieldConfig.defaults.color = fixed(COLORS.cyan); p.fieldConfig.defaults.mappings = structuredClone(noData);
    return p;
  }
  const governance = [
    detail('Controles · critério, situação e evidência', IDS.controls, 0, 15),
    detail('Evolução dos controles · checkpoints', IDS.evolution, 15, 5),
    detail('Plano de ação · execução e conclusão', IDS.actions, 20, 15),
    detail('Riscos · responsável, avaliação e tratamento', IDS.risks, 35, 10),
    matrix(IDS.residual, 'Heatmap · risco residual', 0, 45, 12, 9, s3.risks, 'residual'),
    matrix(408, 'Heatmap · risco inerente', 12, 45, 12, 9, s3.risks, 'inherent'),
    detail('Achados históricos · situação atual', IDS.vulnerabilities, 54, 12),
    detail('Indicadores Sprint 3 · cálculo e decisão', IDS.indicators, 66, 23),
  ];
  statusField(governance[0], 'Status', { Implementado: COLORS.green, Parcial: COLORS.yellow, Pendente: COLORS.red });
  statusField(governance[2], 'Status', { Concluída: COLORS.green, Planejada: COLORS.yellow });
  statusField(governance[3], 'Nível residual', { Crítico: COLORS.red, Alto: COLORS.red, Moderado: COLORS.yellow, Baixo: COLORS.green });
  statusField(governance[6], 'Severidade', { Alta: COLORS.red, Média: COLORS.yellow });
  for (const p of [governance[0], governance[2], governance[3], governance[6]]) navigate(p, 'Consultar fontes e observações', IDS.evidence);
  const sourceMap = new Map(s3.sources.map(source => [source.id, source]));
  const entities = [...s3.controls, ...s3.risks, ...s3.actions, ...s2.vulnerabilities, ...s2.incidents, ...s3.incidents];
  const evidenceRows = entities.flatMap(entity => (entity.technical_evidence ?? []).map(e => [
    entity.id, e.source, sourceMap.get(e.source)?.path ?? sourceMap.get(e.source)?.origin ?? '',
    e.locator ?? e.pointer ?? '', typeof e.observation === 'object' ? JSON.stringify(e.observation) : e.observation ?? '',
  ]));
  const support = table(IDS.evidence, 'Sustentação técnica · fontes e observações', 0, 89, 24, 24, ['Registro', 'Fonte', 'Arquivo preservado', 'Localizador', 'Observação'], evidenceRows,
    { Registro: 90, Fonte: 100, 'Arquivo preservado': 280, Localizador: 240 });
  support.description = 'Fontes preservadas, seletores e observações dos controles, riscos, ações, achados e incidentes. Use o filtro de coluna Registro para aprofundar um ID. Código sustenta revisão estática; avaliações qualitativas não comprovam a si mesmas.';
  field(support, 'Registro', { 'custom.filterable': true });
  governance.push(support);
  technical.push(collapse(400, 'Governança · controles, ações e risco residual · ' + date, governance, 31));
  const infrastructure = [], selected = containerQueries('${servico:regex}');
  infrastructure.push(series(430, 'CPU por serviço · % do limite', 0, 0, 12, 9, [['{{' + group + '}}', selected.cpu]], 'percent'));
  infrastructure.push(series(431, 'Memória por serviço · % do limite', 12, 0, 12, 9, [['{{' + group + '}}', selected.memory]], 'percent'));
  infrastructure.push(series(432, 'Disco do host · raiz', 0, 9, 8, 7, [['Disco utilizado', '100 * (1 - node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"})']], 'percent'));
  infrastructure.push(stat(433, 'Uptime do host', 8, 9, 8, 7, 'time() - node_boot_time_seconds', 's'));
  infrastructure.push(series(434, 'Coleta dos nove alvos', 16, 9, 8, 7, [['{{job}}', 'lab:target_up']]));
  infrastructure.push(series(435, 'Rede por serviço', 0, 16, 12, 7, [['{{' + group + '}}', 'sum by (' + group + ') (rate(container_network_receive_bytes_total{' + project + ',' + group + '=~"${servico:regex}"}[5m]) + rate(container_network_transmit_bytes_total{' + project + ',' + group + '=~"${servico:regex}"}[5m]))']], 'Bps'));
  infrastructure.push(series(436, 'Disponibilidade funcional · lacunas preservadas', 12, 16, 12, 7, [['Consulta autenticada', 'lab:clinical_available']]));
  infrastructure.push(stat(437, 'Completude temporal · verificações', 0, 23, 12, 5, 'clamp_max(100 * count_over_time(probe_success{job="probe"}[$__range]) / ($__range_s / 15), 100)', 'percent'));
  infrastructure.push(stat(438, 'Verificações observadas · período', 12, 23, 12, 5, 'count_over_time(probe_success{job="probe"}[$__range])'));
  technical.push(collapse(429, 'Infraestrutura completa · nove serviços · filtro Serviço', infrastructure, 32));
  const investigations = [logs(IDS.fullLogs, 'Eventos centralizados · API', 0, 0, 24, 15, 200), detail('Incidentes de segurança · cronologia', IDS.incidents, 15, 10), detail('Evolução entre execuções · mesma categoria', IDS.comparison, 25, 7)];
  const oldTimeline = structuredClone(sprint2Panels(s2).panels.find(p => p.title === 'Incidentes · cronologia e resposta'));
  oldTimeline.id = 424; oldTimeline.title = 'Incidentes clínico e coleta · cronologia preservada'; oldTimeline.gridPos = { x: 0, y: 32, w: 24, h: 9 };
  investigations.push(oldTimeline);
  const when = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  const timeline = table(425, 'Timelines · clínico, coleta e autenticação', 0, 41, 24, 10,
    ['ID', 'Categoria', 'Início BRT', 'Detecção BRT', 'Ação BRT', 'Encerramento BRT', 'MTTD (s)', 'MTTR (s)'],
    [...s2.incidents, ...s3.incidents].map(i => [i.id, i.category ?? 'Autenticação', when(i.onset), when(i.detected), when(i.response), when(i.recovered), round(i.detection_seconds), round(i.recovery_seconds)]),
    { ID: 75, Categoria: 175, 'MTTD (s)': 85, 'MTTR (s)': 85 });
  timeline.description = 'Ensaios preservados. Ordem real dos eventos, inclusive restauração do probe anterior ao primeiro firing. MTTD = detecção − início; MTTR = encerramento − detecção. Login inclui confirmação e 60 s sem novas falhas; interrupção do gerador não é bloqueio na API.';
  investigations.push(timeline);
  technical.push(collapse(419, 'Investigação · logs, correlação e timelines preservadas', investigations, 33));
  const history = sprint2Panels(s2).panels.filter(p => p.type !== 'row').map(p => {
    const copy = structuredClone(p); copy.id = p.title === 'Indicadores e decisão associada' ? 1500 : 1000 + p.id;
    copy.title = 'Histórico Sprint 2 · ' + p.title; copy.gridPos = { x: 0, y: 0, w: 24, h: p.type === 'table' ? Math.min(24, p.gridPos.h + 2) : 8 };
    return copy;
  });
  let nextY = 0; for (const p of history) { p.gridPos.y = nextY; nextY += p.gridPos.h; }
  technical.push(collapse(999, 'Histórico Sprint 2 · baseline, experimentos e indicadores', history, 34));
  return { executive: dashboard('saude-v01', 'CyPark · Governança Executiva & Riscos', executive, true),
    technical: dashboard('cypark-secops', 'CyPark · Sustentação Técnica, Operação & SecOps', technical, false) };
}
