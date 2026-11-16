const datasource = { type: 'grafana-testdata-datasource', uid: 'sprint2-analysis' };
const prometheus = { type: 'prometheus', uid: 'prometheus' };
const loki = { type: 'loki', uid: 'loki' };
const csv = (headers, rows) => [headers, ...rows].map(row => row.map(v => v === null || v === undefined ? '' : '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n');
const round = value => value === null ? null : Number(value.toFixed(2));
const utc = value => new Date(value).toISOString().slice(0,19).replace('T',' ');
const sourceIds = refs => [...new Set(refs.map(r=>r.source))].join(', ');
const thresholds = { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'yellow', value: 5 }, { color: 'orange', value: 10 }, { color: 'red', value: 17 }] };

export function sprint3Panels(a) {
  let id = 300;
  const panels = [];
  const period = a.sessions.map(s => `${s.incident}: ${s.start} a ${s.end}`).join('; ');
  const reference = `Avaliação em ${a.assessed_at}. ${a.reference} Recortes fixos: ${period}. O seletor de tempo afeta somente painéis de operação e logs.`;
  function row(title, y) { panels.push({ id: id++, title, type: 'row', collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 } }); }
  function panel(title, type, x, y, w, h, headers, rows, options = {}, defaults = {}) {
    const p = { id: id++, title, type, datasource, gridPos: { x, y, w, h }, description: reference,
      targets: [{ refId: 'A', datasource, scenarioId: 'csv_content', csvContent: csv(headers, rows), dropPercent: 0 }],
      fieldConfig: { defaults: { noValue: '—', unit: 'short', decimals: 2, ...defaults }, overrides: [] }, options };
    panels.push(p); return p;
  }
  const stat = (title,x,y,w,headers,values,unit='short') => panel(title,'stat',x,y,w,4,headers,[values],
    { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none', textMode: 'auto' },
    { unit, decimals: unit==='percent'?0:unit==='suffix:s'?2:0, color: {mode:'fixed',fixedColor:'blue'} });
  const table = (title,x,y,w,h,headers,rows) => panel(title,'table',x,y,w,h,headers,rows,
    { showHeader: true, cellHeight: 'sm', footer: { show: false } }, { decimals:0, custom: { minWidth: 50, align: 'auto', wrapText: true, wrapHeaderText: true, cellOptions: { type: 'auto' }, inspect: false } });
  const widths = (p, fields) => p.fieldConfig.overrides.push(...Object.entries(fields).map(([name,width])=>({matcher:{id:'byName',options:name},properties:[{id:'custom.width',value:width}]})));
  const c = a.counts;
  row('Executiva · riscos, controles e decisões',0);
  stat('Riscos residuais altos e críticos',0,1,6,['Riscos'],[c.residual_risks_high_critical]);
  stat('Controles implementados',6,1,6,['Conformidade interna'],[c.compliance_percent],'percent');
  stat('Incidentes de segurança · situação final',12,1,6,['Abertos','Fechados'],[c.incidents_open,c.incidents_closed]);
  stat('Ações concluídas / planejadas',18,1,6,['Concluídas','Planejadas'],[c.actions_completed,c.actions_total-c.actions_completed]);
  const priorities = table('Ações prioritárias pendentes',0,5,24,9,['ID','Prioridade','Ação','Risco','Responsável','Prazo'],
    a.actions.filter(x=>x.status!=='Concluída').map(x=>[x.id,x.priority,x.action,x.risk,x.owner,'D+'+x.deadline_days]));
  widths(priorities,{'ID':75,'Prioridade':90,'Risco':65,'Responsável':170,'Prazo':75});
  priorities.description += ' Prazos relativos à aprovação do tratamento, sem data de aprovação presumida. Detecção concluída não equivale a prevenção implementada.';
  row('Governança e conformidade · diretriz interna',14);
  const controls = table('Controles · critério, situação e evidência',0,15,24,17,['ID','Controle / critério','Status','Riscos','Responsável','Evidência'],
    a.controls.map(x=>[x.id,x.name+' — '+x.criterion,x.status,x.risks.join(', '),x.owner,sourceIds(x.technical_evidence)]));
  widths(controls,{'ID':70,'Status':110,'Riscos':115,'Responsável':160,'Evidência':100});
  controls.description += ' Implementado exige todas as verificações; Parcial e Pendente não entram no numerador. Evidência é a verificação técnica catalogada, não a avaliação em si.';
  const evolution = table('Evolução dos controles · checkpoints',0,32,24,6,['Checkpoint','Data UTC','Implementados','Parciais','Pendentes','Aplicáveis','Conformidade %','Gaps críticos'],
    a.checkpoints.map(x=>[x.label,utc(x.at),x.implemented,x.partial,x.pending,x.applicable,round(x.compliance_percent),x.critical_gaps]));
  widths(evolution,{'Checkpoint':150,'Data UTC':190});
  evolution.description += ' Gaps críticos = controles incompletos ligados a riscos altos/críticos. Comparação entre duas verificações, sem interpolação de períodos não observados.';
  const actions = table('Plano de ação · execução e conclusão',0,38,24,16,['ID','Risco','Ação','Prioridade / esforço','Responsável','Prazo','Status','Conclusão'],
    a.actions.map(x=>[x.id,x.risk,x.action,x.priority+' / '+x.effort,x.owner,'D+'+x.deadline_days,x.status,x.completion_evidence.length?'Verificado · '+sourceIds(x.completion_evidence):'Sem execução comprovada']));
  widths(actions,{'ID':65,'Risco':60,'Prioridade / esforço':130,'Responsável':145,'Prazo':65,'Status':105,'Conclusão':190});
  row('Riscos atuais · inerente e residual',54);
  function matrix(title,x,field) {
    const m=table(title,x,55,12,9,['P ↓','I = 1','I = 2','I = 3','I = 4','I = 5'],
      [5,4,3,2,1].map(p=>['P = '+p,...[1,2,3,4,5].map(i=>a.risks.some(r=>r[field].probability===p&&r[field].impact===i)?p*i:null)]));
    const mapping=Object.fromEntries([...new Set(a.risks.map(r=>r[field].score))].map(score=>[score,{text:a.risks.filter(r=>r[field].score===score).map(r=>r.id).join(', ')+' · '+score}]));
    const matrixThresholds={mode:'absolute',steps:[{color:'#22252b',value:null},{color:'green',value:1},...thresholds.steps.slice(1)]};
    m.fieldConfig.overrides=[1,2,3,4,5].map(i=>({matcher:{id:'byName',options:'I = '+i},properties:[{id:'thresholds',value:matrixThresholds},{id:'mappings',value:[{type:'value',options:mapping}]},{id:'custom.cellOptions',value:{type:'color-background',mode:'basic'}}]}));
    m.description+=' P × I, ambos 1–5. Baixo 1–4, moderado 5–9, alto 10–16, crítico 17–25. Avaliação qualitativa conservadora; detecção não reduz automaticamente o risco.';
    return m;
  }
  matrix('Heatmap · risco inerente',0,'inherent');
  matrix('Heatmap · risco residual',12,'residual');
  const risks = table('Riscos · responsável, avaliação e tratamento',0,64,24,11,['ID','Ativo / processo','Inerente','Residual','Nível residual','Responsável','Tratamento','Situação','Ações'],
    a.risks.map(r=>[r.id,r.asset,r.inherent.score,r.residual.score,r.residual.level,r.owner,r.treatment,r.status,r.actions.join(', ')]));
  widths(risks,{'ID':65,'Inerente':80,'Residual':80,'Nível residual':120,'Responsável':150,'Tratamento':100,'Situação':130,'Ações':160});
  const vulnerabilities=table('Achados históricos · situação atual',0,75,24,11,['ID','Ativo','Achado','Severidade','Situação atual'],a.vulnerabilities.map(v=>[v.id,v.asset,v.finding,v.severity,v.current_status]));
  widths(vulnerabilities,{'ID':75,'Ativo':80,'Severidade':95,'Situação atual':430});
  vulnerabilities.description+=' Os cinco achados preservam sua origem na Sprint 2. Centralização no mesmo host reduz a limitação de consulta, mas não comprova preservação externa nem elimina o risco.';
  row('Segurança · detecção e investigação',86);
  const login = stat('Falhas de login estimadas · último minuto',0,87,6,['Estimativa'],[0]);
  login.datasource=prometheus;login.targets=[{refId:'A',datasource:prometheus,expr:'sum(increase(clinical_auth_failures_total{stage="login"}[1m]))',instant:true}];
  login.description='Ao vivo. Estimativa Prometheus; disparo ≥5 por minuto durante 15 s. Logs sustentam contagem exata. Token inválido não entra neste contador.';
  const health=stat('Fontes de logs · serviços observados',6,87,6,['Fontes'],[0]);
  health.datasource=loki;health.targets=[{refId:'A',datasource:loki,expr:'count(sum by (service) (count_over_time({service="api"}[$__range])))',queryType:'instant'}];
  health.description='Quantidade de serviços com eventos centralizados no intervalo selecionado. Escopo previsto: API. Não confundir com os nove alvos de métricas.';
  stat('MTTD · autenticação · n = 2',12,87,6,['Detecção'],[c.mttd_seconds],'suffix:s');
  stat('MTTR simulado · autenticação · n = 2',18,87,6,['Encerramento'],[c.mttr_seconds],'suffix:s');
  panels.push({id:id++,title:'Eventos centralizados · API',type:'logs',datasource:loki,gridPos:{x:0,y:91,w:24,h:12},
    description:'Ao vivo no intervalo selecionado. Eventos authentication, record_access e request_error; investigação por service + instance_id + correlation_id. Não somar diagnóstico request_error à resposta da mesma requisição.',
    targets:[{refId:'A',datasource:loki,expr:'{service="api"} | json',queryType:'range',maxLines:200}],
    options:{showTime:true,showLabels:false,showCommonLabels:false,wrapLogMessage:true,prettifyLogMessage:true,enableLogDetails:true,sortOrder:'Descending',dedupStrategy:'none'}});
  const incidents=table('Incidentes de segurança · cronologia',0,103,24,10,['ID','Status','Severidade','Início UTC','Detecção UTC','Ação UTC','Encerramento UTC'],
    a.incidents.map(i=>[i.id,i.status,i.severity,utc(i.onset),utc(i.detected),utc(i.response),utc(i.recovered)]));
  widths(incidents,{'ID':75,'Status':80,'Severidade':90});
  incidents.description+=' O encerramento exige consulta válida, 60 s sem novas falhas e alerta resolvido. A resposta automatizada interrompe o gerador; não bloqueia atacante.';
  const comparison=table('Evolução entre execuções · mesma categoria',0,113,24,7,['Incidente','Falhas de login','MTTD (s)','Até ação (s)','MTTR simulado (s)','Responsável'],
    a.incidents.map(i=>[i.id,i.failed_logins,round(i.detection_seconds),round(i.response_seconds),round(i.recovery_seconds),i.response_actor]));
  comparison.fieldConfig.defaults.decimals=2;
  comparison.description+=' MTTD = primeiro firing − primeiro 401; até ação = interrupção do gerador − firing; MTTR = encerramento confirmado − firing. Duas observações não estabelecem tendência estatística. Sem comparação agregada com disponibilidade da Sprint 2.';
  row('KPIs e KRIs · Sprint 3',120);
  const indicators=table('Indicadores Sprint 3 · cálculo e decisão',0,121,24,32,['Indicador','Resultado','Meta / limiar','Fórmula','Decisão'],
    a.indicators.map(k=>[k.name,k.value,k.target,k.formula,k.decision]));
  widths(indicators,{'Indicador':240,'Resultado':160,'Meta / limiar':180,'Fórmula':300});
  return {panels,height:154};
}
