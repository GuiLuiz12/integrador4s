const datasource = { type: 'grafana-testdata-datasource', uid: 'sprint2-analysis' };
const reference = 'Recorte fixo: 26/10/2026, 19:57–20:57 (UTC−03). Valores derivados das fontes preservadas; avaliações de risco constam no relatório. O seletor de tempo não altera este recorte.';
const report = 'http://localhost:3000/analysis/sprint2';
const csv = (headers, rows) => [headers, ...rows].map(row => row.map(v => v === null || v === undefined ? '' : '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n');
const round = value => value === null ? null : Number(value.toFixed(2));
const thresholds = steps => ({ mode: 'absolute', steps });
const riskThresholds = thresholds([{ color: 'green', value: null }, { color: 'yellow', value: 5 }, { color: 'orange', value: 10 }, { color: 'red', value: 17 }]);

export function sprint2Panels(a) {
  let id = 100;
  const panels = [];
  function row(title, y) { panels.push({ id: id++, title, type: 'row', collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 } }); }
  function panel(title, type, x, y, w, h, headers, rows, options = {}, defaults = {}) {
    const p = { id: id++, title, type, datasource, gridPos: { x, y, w, h }, description: reference,
      links: [{ title: 'Relatório e evidências', url: report, targetBlank: true }],
      targets: [{ refId: 'A', datasource, scenarioId: 'csv_content', csvContent: csv(headers, rows), dropPercent: 0 }],
      fieldConfig: { defaults: { noValue: '—', unit: 'short', decimals: 2, ...defaults }, overrides: [] },
      options: { ...options } };
    panels.push(p); return p;
  }
  const stat = (title,x,headers,values,unit='short',limits) => panel(title,'stat',(x%12)*2,x<12?1:5,8,4,headers,[values],
    { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none', textMode: 'auto', orientation: 'auto' },
    { unit: unit==='s'?'suffix:s':unit, decimals: unit==='s'?1:0, thresholds: limits ?? thresholds([{color:'green',value:null},{color:'red',value:1}]) });
  const table = (title,x,y,w,h,headers,rows) => panel(title,'table',x,y,w,h,headers,rows,
    { showHeader: true, cellHeight: 'sm', footer: { show: false } }, { custom: { minWidth: 40, align: 'auto', wrapText: true, wrapHeaderText: true, cellOptions: { type: 'auto' }, inspect: false } });
  const widths = (p, fields) => p.fieldConfig.overrides.push(...Object.entries(fields).map(([name,width])=>({matcher:{id:'byName',options:name},properties:[{id:'custom.width',value:width}]})));
  const bars = (title,x,y,w,h,headers,rows) => panel(title,'barchart',x,y,w,h,headers,rows,
    { xField: headers[0], orientation: 'horizontal', stacking: 'none', showValue: 'always', groupWidth: 0.7, barWidth: 0.85, legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
    { min: 0, color: { mode: 'palette-classic' } });
  row('Análise · 26/10/2026 · 19:57–20:57',0);
  stat('Riscos altos e críticos',0,['Riscos'],[a.counts.risks_high_critical]);
  stat('Vulnerabilidades altas',4,['Achados'],[a.counts.vulnerabilities_by_severity.Alta ?? 0]);
  stat('Incidentes · situação final',8,['Abertos','Fechados'],[a.counts.incidents_open,a.counts.incidents_closed], 'short', thresholds([{color:'blue',value:null}]));
  stat('MTTD · 2 incidentes',12,['Detecção'],[a.counts.mttd_seconds],'s',thresholds([{color:'green',value:null},{color:'red',value:120.001}]));
  stat('MTTR · após detecção',16,['Recuperação'],[a.counts.mttr_seconds],'s',thresholds([{color:'green',value:null},{color:'red',value:60.001}]));
  stat('Tratamento definido',20,['Riscos com plano'],[a.counts.risks_with_treatment_percent],'percent',thresholds([{color:'red',value:null},{color:'green',value:100}]));
  row('Baseline e tendências',9);
  const baseline = table('Baseline × experimento',0,10,16,15,['Métrica','Unidade','Base média','Base pico','Exp. média','Exp. pico','Limiar'],
    a.metrics.map(m=>[m.metric,m.unit,round(m.baseline.mean),round(m.baseline.peak),round(m.experiment.mean),round(m.experiment.peak),m.threshold===null?'Comparativo':(m.key==='availability_percent'?'≥':m.key==='clinical_errors_percent'?'<':'≤')+m.threshold]));
  widths(baseline,{'Métrica':170,'Unidade':140});
  const cpu = a.metrics.find(m=>m.key==='api_cpu_percent');
  const phase = bars('CPU APP-01 · comparação por fase',16,10,8,15,['Fase','Média','Pico'],
    [['Baseline',round(cpu.baseline.mean),round(cpu.baseline.peak)],...a.phases.filter(p=>['normal_before_load','load','db_outage','db_recovery','probe_outage','normal_after_recovery'].includes(p.id))
      .map(p=>[p.name,round(p.metrics.api_cpu_percent.mean),round(p.metrics.api_cpu_percent.peak)])]);
  phase.fieldConfig.defaults.unit='percent';phase.description += ' CPU em % do limite de 1 CPU, calculada em janelas móveis de cinco minutos; as bordas das fases incluem contexto anterior.';
  row('Riscos e plano de tratamento',25);
  const matrix=table('Matriz · probabilidade × impacto',0,26,8,9,['P ↓','I = 1','I = 2','I = 3','I = 4','I = 5'],
    [5,4,3,2,1].map(p=>['P = '+p,...[1,2,3,4,5].map(i=>a.risks.some(r=>r.probability===p&&r.impact===i)?p*i:null)]));
  const mapping = Object.fromEntries([...new Set(a.risks.map(r=>r.score))].map(score=>[score,{text:a.risks.filter(r=>r.score===score).map(r=>r.id).join(', ')+' · '+score,color:score>=17?'red':score>=10?'orange':score>=5?'yellow':'green'}]));
  const matrixThresholds = thresholds([{color:'#22252b',value:null},{color:'green',value:1},...riskThresholds.steps.slice(1)]);
  matrix.fieldConfig.overrides=[1,2,3,4,5].map(i=>({matcher:{id:'byName',options:'I = '+i},properties:[{id:'thresholds',value:matrixThresholds},{id:'mappings',value:[{type:'value',options:mapping}]},{id:'custom.cellOptions',value:{type:'color-background',mode:'basic'}}]}));
  widths(matrix,{'P ↓':50,'I = 1':50,'I = 2':50,'I = 3':50,'I = 4':90,'I = 5':80});
  matrix.description += ' P e I de 1 a 5; risco inerente = P × I. Células vazias não têm riscos registrados. Classificação qualitativa do cenário.';
  const riskTable=table('Registro de riscos e responsáveis',8,26,16,9,['ID','Ativo','P','I','Inerente','Nível','Responsável','Estratégia','Prazo'],
    a.risks.map(r=>[r.id,r.asset.split(' / ')[0],r.probability,r.impact,r.score,r.level,r.owner,r.treatment,'D+'+r.deadline_days]));
  riskTable.fieldConfig.overrides=[{matcher:{id:'byName',options:'Inerente'},properties:[{id:'thresholds',value:riskThresholds},{id:'custom.cellOptions',value:{type:'color-background',mode:'basic'}}]}];
  riskTable.fieldConfig.defaults.decimals=0;
  widths(riskTable,{'ID':50,'Ativo':85,'P':50,'I':50,'Inerente':65,'Nível':85,'Responsável':150,'Estratégia':90,'Prazo':60});
  riskTable.description += ' Prazos após aprovação do plano. Todos os tratamentos estão planejados; risco residual ainda não reavaliado.';
  row('Vulnerabilidades e exposição',35);
  const severity = bars('Achados por severidade',0,36,6,11,['Severidade','Achados'],['Crítica','Alta','Média','Baixa'].map(s=>[s,a.counts.vulnerabilities_by_severity[s]??0]));
  severity.fieldConfig.defaults.decimals=0;
  const assets = bars('Ativos com mais achados',6,36,6,11,['Ativo','Achados'],Object.entries(a.counts.vulnerabilities_by_asset).sort((a,b)=>b[1]-a[1]));
  assets.fieldConfig.defaults.decimals=0;
  assets.description += ' Quantidade de achados por ativo. Exposição considera também severidade, condições de acesso e dependência: APP-01 concentra superfícies de login/consulta; DB-01 sustenta a continuidade. Contexto e evidências na seção 5 do relatório; sem pontuação adicional.';
  const vulnerabilities = table('Inventário de vulnerabilidades',12,36,12,11,['ID','Ativo','Achado','Severidade','Fonte'],a.vulnerabilities.map(v=>[v.id,v.asset,v.finding,v.severity,v.evidence.join(', ')]));
  widths(vulnerabilities,{'ID':70,'Ativo':75,'Severidade':90,'Fonte':100});
  row('Incidentes e alertas',47);
  const local=value=>value?new Date(value).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour12:false}):'—';
  const incidents = table('Incidentes · cronologia e resposta',0,48,17,8,['ID','Categoria','Severidade','Status','Início','Detecção','Ação','Retorno','Resposta (s)'],
    a.incidents.map(i=>[i.id,i.category,i.severity,i.status,local(i.onset),local(i.detected),local(i.response),local(i.recovered),round(i.response_seconds)]));
  widths(incidents,{'ID':65,'Categoria':180,'Severidade':75,'Status':65,'Início':75,'Detecção':75,'Ação':75,'Retorno':75,'Resposta (s)':85});
  incidents.description += ' Resposta = início confirmado até solicitação automatizada de restauração; MTTD e MTTR estão nos indicadores. No probe a ação programada precede a primeira amostra firing em 0,73 s; ordem e milissegundos no relatório.';
  const alerts = bars('Episódios de alerta por criticidade',17,48,7,8,['Criticidade','Episódios'],[['Crítico',a.counts.alerts_by_severity.critical??0],['Aviso',a.counts.alerts_by_severity.warning??0]]);
  alerts.fieldConfig.defaults.decimals=0;
  row('KPIs, KRIs e decisões',56);
  const indicatorHeight = Math.max(15, Math.ceil((a.indicators.length * 40 + 80) / 30));
  const indicators = table('Indicadores e decisão associada',0,57,24,indicatorHeight,['Indicador','Resultado','Meta / limiar','Tendência / decisão','Fonte'],
    a.indicators.map(k=>[k.name,k.value,k.target,k.decision,[...new Set(k.technical_evidence.map(r=>r.source))].join(', ')]));
  widths(indicators,{'Indicador':250,'Resultado':220,'Meta / limiar':170,'Fonte':80});
  return { panels, height: 58 + indicatorHeight };
}
