#!/usr/bin/env python3
"""Build Sprint 2 analysis from preserved evidence, independently of scenario acceptance."""
import collections
import datetime as dt
import hashlib
import html
import json
import math
import pathlib
import re
import shutil
import statistics
from zoneinfo import ZoneInfo

from evidence import ROOT, timestamp, iso
from evidence_analysis import verify_manifest, response_events, counter_change

BASELINE = ROOT / 'evidence/validated/refinamento-sprint1/baseline'
EXPERIMENT = ROOT / 'evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e'
OUTPUT = ROOT / 'analysis/sprint2'
ZONE = ZoneInfo('America/Sao_Paulo')


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def statistics_of(values):
    values = [float(v) for v in values if math.isfinite(float(v))]
    return {'mean': statistics.mean(values), 'peak': max(values), 'samples': len(values)} if values else {'mean': None, 'peak': None, 'samples': 0}


def points(queries, name, service=None, start=None, end=None, **labels):
    selected = []
    for series in queries[name]['data']['result']:
        metric = series['metric']
        if service and metric.get('container_label_com_docker_compose_service') != service:
            continue
        if not all(metric.get(k) == v for k, v in labels.items()):
            continue
        selected.extend((float(t), float(v)) for t, v in series['values'] if
                        (start is None or t >= start) and (end is None or t < end))
    return sorted(selected)


def alert_episodes(series, scrape_seconds=15):
    """Count firing episodes by complete label set, not individual samples."""
    episodes = []
    for item in series:
        labels = item['metric']
        if labels.get('alertstate') != 'firing':
            continue
        active = None
        for time, value in sorted(item['values']):
            if float(value) != 1:
                active = None
                continue
            if active is None or time - active['last_sample'] > 2 * scrape_seconds:
                active = {'alert': labels['alertname'], 'severity': labels.get('severity', 'unknown'),
                          'job': labels.get('job'), 'started_at': iso(time), 'last_sample': time}
                episodes.append(active)
            else:
                active['last_sample'] = time
    return sorted(episodes, key=lambda e: e['started_at'])


def risk_level(score):
    return 'Crítico' if score >= 17 else 'Alto' if score >= 10 else 'Moderado' if score >= 5 else 'Baixo'


def load_session(folder):
    manifest = verify_manifest(folder)  # Integrity only; preserves the legacy acceptance result.
    return {'manifest': manifest, 'raw': read(folder / 'series.json')['queries'],
            'derived': read(folder / 'derived.json')['queries'], 'inventory': read(folder / 'inventory.json')}


def metrics(session, start=None, end=None):
    raw, derived = session['raw'], session['derived']
    result = {}
    def add(key, family, name, factor=1, service=None):
        result[key] = statistics_of(v * factor for _, v in points(family, name, service, start, end))
    add('host_cpu_percent', derived, 'host_cpu_percent')
    add('host_memory_percent', derived, 'host_memory_percent')
    add('clinical_volume', derived, 'clinical_volume')
    add('clinical_p95_ms', derived, 'clinical_p95', 1000)
    add('clinical_errors_percent', derived, 'clinical_errors_percent')
    for asset in session['inventory']['assets']:
        service = asset['service']
        add(service + '_cpu_percent', derived, 'container_cpu_cores', 100 / (asset['cpu_limit_nanocpus'] / 1e9), service)
        add(service + '_memory_percent', raw, 'container_memory', 100 / asset['memory_limit_bytes'], service)
        add(service + '_network_kib', derived, 'container_network_bytes_per_second', 1 / 1024, service)
    probe = points(raw, 'probe_history', start=start, end=end)
    result['availability_percent'] = statistics_of(v * 100 for _, v in probe)
    return result


def local(value):
    return dt.datetime.fromtimestamp(timestamp(value), ZONE).strftime('%d/%m/%Y %H:%M:%S')


def fmt(value, digits=2):
    return '—' if value is None else f'{value:.{digits}f}'.replace('.', ',')


def build_analysis(baseline, experiment, registers):
    b, e = load_session(baseline), load_session(experiment)
    raw, manifest = e['raw'], e['manifest']
    timeline = {entry['event']: entry for entry in read(experiment / 'session.json')}
    events = response_events([json.loads(line) for line in (experiment / 'events.jsonl').read_text().splitlines()])
    episodes = alert_episodes(raw['alert_history']['data']['result'], manifest['scrape_interval_seconds'])
    incidents = []
    specs = [('INC-01', 'Indisponibilidade assistencial', 'DB-01', 'Crítica', 'ConsultaAssistencialIndisponivel',
              'postgres_outage_confirmed', 'postgres_restart_requested', 'probe_history', {}, 'R-01'),
             ('INC-02', 'Perda de observabilidade', 'MON-01', 'Média', 'FalhaDeColeta',
              'probe_outage_confirmed', 'probe_restore_requested', 'targets', {'job': 'probe'}, 'R-04')]
    for identifier, category, asset, severity, alert, onset_key, response_key, family, labels, risk in specs:
        onset = timestamp(timeline[onset_key]['at'])
        response = timestamp(timeline[response_key]['at'])
        detected = next((timestamp(x['started_at']) for x in episodes if x['alert'] == alert and timestamp(x['started_at']) >= onset), None)
        recovered = next((t for t, value in points(raw, family, **labels) if t >= response and value == 1), None)
        incidents.append({'id': identifier, 'category': category, 'asset': asset, 'severity': severity,
                          'status': 'Fechado' if recovered is not None else 'Aberto', 'risk': risk,
                          'onset': iso(onset), 'detected': iso(detected) if detected else None,
                          'response': iso(response), 'recovered': iso(recovered) if recovered else None,
                          'detection_seconds': detected - onset if detected else None,
                          'recovery_seconds': recovered - detected if recovered is not None and detected is not None else None,
                          'impact_seconds': recovered - onset if recovered is not None else None,
                          'owner': 'Operação de TI', 'response_actor': 'Roteiro automatizado', 'evidence': ['E03', 'E05']})
    risks = [dict(r, score=r['probability'] * r['impact'], level=risk_level(r['probability'] * r['impact'])) for r in registers['risks']]
    bm, em = metrics(b), metrics(e)
    descriptions = [
        ('api_cpu_percent','CPU APP-01','% do limite de 1 CPU',80,'Folga de processamento; não há evidência de saturação.'),
        ('api_memory_percent','Memória APP-01','% de 768 MiB',80,'Crescimento entre sessões, ainda distante do limite; não comprova vazamento.'),
        ('postgres_cpu_percent','CPU DB-01','% do limite de 1 CPU',80,'Baixo consumo; a indisponibilidade decorre da parada programada.'),
        ('postgres_memory_percent','Memória DB-01','% de 1.536 MiB',80,'Uso baixo em relação à capacidade configurada.'),
        ('host_cpu_percent','CPU HOST-01','%',80,'Inclui processos externos ao projeto.'),
        ('host_memory_percent','Memória HOST-01','%',80,'Diferença entre sessões pode incluir outras aplicações do host.'),
        ('api_network_kib','Tráfego APP-01','KiB/s',None,'Comparar com o baseline; não há capacidade de rede contratada definida.'),
        ('clinical_volume','Consultas concluídas','respostas/s',None,'Baseline próximo de 1/s; carga ampliada próxima de 5/s.'),
        ('clinical_p95_ms','Latência p95','ms',500,'P95 estimado por histogramas em janelas de cinco minutos.'),
        ('clinical_errors_percent','Erros de consulta','%',1,'Conta somente respostas da rota clínica; falhas de login ficam fora.'),
        ('availability_percent','Disponibilidade assistencial','%',99,'Considera apenas verificações observadas; lacunas não são sucesso.')]
    comparison = [dict(key=key,metric=name,unit=unit,threshold=threshold,interpretation=interpretation,
                       baseline=bm[key],experiment=em[key],evidence=['B02','B03','E02','E03']) for key,name,unit,threshold,interpretation in descriptions]
    phase_names = {'normal_before_load':'Normal inicial','load':'Carga 5/s','normal_after_load':'Após carga',
                   'invalid_logins':'Logins inválidos','normal_before_db_outage':'Antes da parada',
                   'db_outage':'Banco parado','db_recovery':'Recuperação do banco',
                   'normal_before_probe_outage':'Antes do probe','probe_outage':'Falha do probe','normal_after_recovery':'Normal final'}
    phases = [dict(id=p['id'],name=phase_names[p['id']],started_at=p['started_at'],ended_at=p['ended_at'],
                   metrics=metrics(e,timestamp(p['started_at']),timestamp(p['ended_at']))) for p in manifest['phases']]
    duration = timestamp(manifest['range_end']) - timestamp(manifest['range_start'])
    probe = points(raw,'probe_history')
    successes = sum(value == 1 for _,value in probe)
    invalid = sum(event['event']=='authentication' and event['status']==401 for event in events)
    auth503 = sum(event['event']=='authentication' and event['status']==503 for event in events)
    record503 = sum(event['event']=='record_access' and event.get('traffic')=='clinical' and event['status']==503 for event in events)
    max_gap = max(right[0]-left[0] for name in ('container_cpu','container_memory','container_network_receive','container_network_transmit')
                  for series in raw[name]['data']['result'] for left,right in zip(series['values'],series['values'][1:]))
    counts = {'risks_high_critical':sum(r['score']>=10 for r in risks),'risks_critical':sum(r['score']>=17 for r in risks),
              'risks_with_treatment_percent':100*sum(bool(r['action'] and r['owner'] and r['deadline_days']) for r in risks)/len(risks),
              'vulnerabilities_by_severity':dict(collections.Counter(v['severity'] for v in registers['vulnerabilities'])),
              'vulnerabilities_by_asset':dict(collections.Counter(v['asset'] for v in registers['vulnerabilities'])),
              'alerts_by_severity':dict(collections.Counter(v['severity'] for v in episodes)),
              'incidents_open':sum(i['status']=='Aberto' for i in incidents),'incidents_closed':sum(i['status']=='Fechado' for i in incidents),
              'mttd_seconds':statistics_of(i['detection_seconds'] for i in incidents if i['detection_seconds'] is not None)['mean'],
              'mttr_seconds':statistics_of(i['recovery_seconds'] for i in incidents if i['recovery_seconds'] is not None)['mean']}
    return {'schema_version':1,'title':'Sprint 2 — Analisar','baseline':{'session_id':b['manifest']['session_id'],'start':b['manifest']['range_start'],'end':b['manifest']['range_end']},
            'experiment':{'session_id':manifest['session_id'],'start':manifest['range_start'],'end':manifest['range_end'],'duration_seconds':duration},
            'quality':{'observations':len(probe),'successes':successes,'failures':len(probe)-successes,'availability_percent':100*successes/len(probe),
                       'completeness_percent':100*len(probe)/(duration/15),'maximum_container_gap_seconds':max_gap,
                       'legacy_acceptance':'Rejeitado pelo critério de mínimo de 60 erros 503 na consulta; uso analítico autorizado com essa limitação declarada.'},
            'events':{'invalid_logins':invalid,'authentication_503':auth503,'clinical_record_503':record503},
            'metrics':comparison,'phases':phases,'incidents':incidents,'alert_episodes':episodes,'counts':counts,
            'vulnerabilities':registers['vulnerabilities'],'risks':risks,'risk_method':registers['method'],
            'probability_scale':registers['probability_scale'],'impact_scale':registers['impact_scale'],'deadline_basis':registers['deadline_basis']}


def report_blocks(a):
    q,c,e = a['quality'],a['counts'],a['events']
    sections=[]
    def section(title):
        blocks=[]; sections.append((title,blocks));return blocks
    def paragraph(blocks,text): blocks.append(('p',text))
    def table(blocks,headers,rows): blocks.append(('table',(headers,rows)))
    b=section('1. Resumo da sprint')
    paragraph(b, f'A análise identificou capacidade disponível sob carga de até cinco consultas/s e duas interrupções distintas: indisponibilidade assistencial causada pela parada do banco e perda de observabilidade causada pela falha do probe. Ambos os incidentes foram encerrados. A disponibilidade observada foi {fmt(q["availability_percent"])}%, com {q["failures"]} verificações malsucedidas em {q["observations"]}. O principal fator de continuidade é a dependência do banco, não a saturação de CPU ou memória. E02 E03 E04 E05')
    paragraph(b, f'Foram registrados cinco achados de configuração/arquitetura e cinco riscos inerentes: {c["risks_critical"]} crítico e {c["risks_high_critical"]-c["risks_critical"]} altos. Todos têm tratamento, responsável e prazo propostos; isso não significa que os controles já estejam implementados. As prioridades são recuperação do banco, autorização por prontuário e limitação de tentativas de login. C01 C02 C03')
    b=section('2. Período e qualidade dos dados')
    table(b,['Conjunto','Início — São Paulo (UTC−03)','Fim — São Paulo (UTC−03)','Uso'],[
        ['Baseline',local(a['baseline']['start']),local(a['baseline']['end']),'30 minutos em carga normal; B01 B02 B03'],
        ['Experimento',local(a['experiment']['start']),local(a['experiment']['end']),'60 minutos após estabilização; E01 E02 E03 E04 E05']])
    paragraph(b, f'Fontes: Prometheus (coleta/avaliação a cada 15 s), cAdvisor, Node Exporter, logs estruturados da API e timeline do roteiro. O experimento contém {q["observations"]} verificações, {q["successes"]} bem-sucedidas e completude temporal de {fmt(q["completeness_percent"])}%. A lacuna planejada do probe foi de aproximadamente 90 s. A maior lacuna de recursos dos contêineres foi {fmt(q["maximum_container_gap_seconds"],1)} s. Ausência de dados não foi preenchida. E01 E03 E05')
    paragraph(b, 'Limitações: cenário simulado, janela curta, host compartilhado, imagens locais reconstruídas e sessões em dias diferentes. CPU/memória do host incluem outras aplicações. Médias e picos são calculados sobre amostras disponíveis; CPU, tráfego, erros e p95 usam curvas de cinco minutos. A média dos p95 não é o p95 global. Os limiares são referências propostas para o cenário, não SLA contratual. O baseline não demonstra uma tendência histórica de longo prazo.')
    paragraph(b, f'O verificador anterior rejeitou a sessão por exigir 60 respostas 503 exclusivamente na consulta: foram {e["clinical_record_503"]} na consulta e {e["authentication_503"]} na autenticação, pois a renovação do token ocorreu durante a parada. A integridade das fontes foi conferida; a coleta completa, os alertas e a recuperação sustentam esta análise. A rejeição original foi preservada e não é ocultada nem convertida em aprovação. E01 E03 E04 C06')
    b=section('3. Baseline operacional')
    table(b,['Métrica','Média baseline','Pico baseline','Limiar','Interpretação'],[
        [m['metric']+' ('+m['unit']+')',fmt(m['baseline']['mean']),fmt(m['baseline']['peak']),('≥ ' if m['key']=='availability_percent' else '< ' if m['key']=='clinical_errors_percent' else '≤ ')+fmt(m['threshold']) if m['threshold'] is not None else 'Referência comparativa',m['interpretation']] for m in a['metrics']])
    paragraph(b, 'Fontes das linhas: B02 B03. APP-01 = API (1 CPU, 768 MiB); DB-01 = PostgreSQL (1 CPU, 1.536 MiB); HOST-01 = máquina anfitriã. MON-01 reúne Prometheus/probe; LOG-01 representa a retenção local de logs. CPU e memória dos serviços usam os limites do contêiner como denominador. O limiar de 80% preserva margem operacional; p95 ≤500 ms, erros <1% e disponibilidade ≥99% seguem as referências do projeto. Tráfego e volume usam o baseline como comparação, sem limiar de saturação inventado. C01 C04')
    b=section('4. Anomalias e causas prováveis')
    api=next(m for m in a['metrics'] if m['key']=='api_cpu_percent');mem=next(m for m in a['metrics'] if m['key']=='api_memory_percent');p95=next(m for m in a['metrics'] if m['key']=='clinical_p95_ms')
    table(b,['Horário em 26/10','Evidência','Impacto / hipótese','Ação recomendada'],[
        ['20:07–20:17','Carga de 5/s; pico CPU APP-01 '+fmt(api['experiment']['peak'])+'%; p95 máximo '+fmt(p95['experiment']['peak'])+' ms. E02 E05','Aumento de demanda sem saturação observada.','Manter capacidade e acompanhar crescimento; não ampliar recursos só por este ensaio.'],
        ['20:22','Dez logins recusados com HTTP 401. E04 E05','Tentativas controladas; nenhum acesso indevido comprovado.','Aplicar limitação e alerta por repetição (R-03).'],
        ['20:27–20:29','Banco parado; 23 consultas e 106 autenticações com HTTP 503. E03 E04 E05','Dependência do banco interrompe o fluxo; renovação de token muda a etapa da falha.','Priorizar recuperação e backup (R-01).'],
        ['20:37–20:38','Probe sem coleta; API e gerador continuam. E03 E05','Perda de visibilidade, sem indisponibilidade clínica demonstrada nesse intervalo.','Adicionar observação externa (R-04).'],
        ['Comparação entre sessões','Memória média APP-01: '+fmt(mem['baseline']['mean'])+'% → '+fmt(mem['experiment']['mean'])+'%. B03 E03','Maior working set com outra sessão/imagem/carga; dados não provam vazamento.','Acompanhar séries mais longas antes de atribuir causa ou alterar limites.']])
    b=section('5. Vulnerabilidades')
    paragraph(b,'Inventário obtido por revisão de código, configuração e evidências do cenário. São fragilidades de controle e arquitetura; não se trata de uma lista de CVEs confirmadas por scanner. A exposição atual é local, com API e Grafana vinculados a loopback. As severidades representam impacto potencial no cenário de saúde.')
    table(b,['ID','Ativo','Achado','Severidade','Exposição','Tratamento / evidência'],[[v['id'],v['asset'],v['finding'],v['severity'],v['exposure'],v['treatment']+' '+' '.join(v['evidence'])] for v in a['vulnerabilities']])
    b=section('6. Registro e matriz de riscos')
    paragraph(b,a['risk_method']+' A probabilidade é uma avaliação qualitativa do cenário, não a frequência das falhas induzidas. Impacto considera continuidade, confidencialidade e capacidade de investigação. Responsáveis são papéis organizacionais propostos.')
    table(b,['ID','Ativo/processo','Ameaça','Vulnerabilidade','Prob.','Impacto','Risco','Responsável'],[[r['id'],r['asset'],r['threat'],r['vulnerability'],r['probability'],r['impact'],str(r['score'])+' · '+r['level'],r['owner']] for r in a['risks']])
    table(b,['Probabilidade ↓ / Impacto →','1','2','3','4','5'],[[str(p)+' · '+a['probability_scale'][str(p)]]+['; '.join(r['id'] for r in a['risks'] if r['probability']==p and r['impact']==i) or '—' for i in range(1,6)] for p in range(5,0,-1)])
    table(b,['Risco','Causa → evento → impacto','Justificativa / fonte'],[[r['id'],r['cause']+' → '+r['event']+' → '+r['impact_description'],r['rationale']+' '+' '.join(r['evidence'])] for r in a['risks']])
    b=section('7. Incidente simulado')
    paragraph(b,'Cenário principal: parada controlada do PostgreSQL por 120 s, interrompendo autenticação e consulta. Severidade crítica pela indisponibilidade do fluxo assistencial. Contenção: manter o teste restrito ao ambiente local e observar a API/coleta. Recuperação: reiniciar a dependência e confirmar login e leitura. O segundo incidente interrompeu somente o probe por 90 s; a restauração ocorreu por expiração/controle local. As respostas foram automatizadas pelo roteiro, não medem tempo de reação humana. E03 E04 E05')
    table(b,['Incidente / categoria','Severidade / status','Início confirmado','Detecção','Recuperação observada','Responsável'],[[i['id']+' · '+i['category'],i['severity']+' / '+i['status'],local(i['onset']),local(i['detected']) if i['detected'] else '—',local(i['recovered']) if i['recovered'] else '—',i['owner']] for i in a['incidents']])
    table(b,['Incidente','Tempo até detectar','Recuperação após detecção','Impacto observado','Evidência'],[[i['id'],fmt(i['detection_seconds'])+' s',fmt(i['recovery_seconds'])+' s',fmt(i['impact_seconds'])+' s',' '.join(i['evidence'])] for i in a['incidents']])
    paragraph(b,'Dois episódios de alerta foram identificados: um crítico e um warning. Amostras consecutivas da mesma regra e conjunto de labels, separadas por até 30 s, formam um episódio. Não se contam amostras de ALERTS como incidentes. A cronologia confirma o cenário, e a primeira amostra saudável após a solicitação de restauração define recuperação. A perda do probe é incidente de observabilidade separado do incidente assistencial.')
    b=section('8. KPIs e KRIs')
    table(b,['Indicador','Resultado atual','Meta / limiar','Tendência / decisão'],[[k['name'],k['value'],k['target'],k['decision']] for k in a['indicators']])
    paragraph(b,'MTTD = média de detecção − início confirmado; MTTR = média de recuperação observada − detecção. População: os dois incidentes fechados desta sessão, incluindo o incidente de observabilidade; os tempos individuais estão na seção 7. São medidas do cenário simulado, com resolução da coleta, e não desempenho histórico da operação. Tendências comparam baseline e experimento; riscos/vulnerabilidades são o primeiro registro e não possuem série histórica anterior. Tratamento definido não equivale a risco mitigado.')
    b=section('9. Dashboard v0.2')
    paragraph(b,'A visão analítica apresenta riscos altos/críticos, vulnerabilidades altas, incidentes abertos/fechados, MTTD, MTTR e cobertura do plano de tratamento. As seções seguintes mostram baseline × experimento, CPU por fase, matriz P × I, registro de riscos, achados por severidade/ativo, episódios de alerta, incidentes e decisões associadas aos KPIs/KRIs. Os painéis operacionais existentes permanecem disponíveis com o intervalo selecionado no Grafana.')
    paragraph(b,'Os painéis analíticos usam o recorte fixo identificado no título e dados calculados a partir dos arquivos preservados; mudar o seletor de tempo afeta os painéis operacionais, não reclassifica o registro de riscos. Links de relatório e dados permitem consultar os resultados e as fontes.')
    b=section('10. Recomendações priorizadas')
    table(b,['Prioridade','Ação','Esforço','Risco tratado','Responsável','Prazo','Estratégia / status'],[[r['priority'],r['action'],r['effort'],r['id'],r['owner'],'D+'+str(r['deadline_days']),r['treatment']+' / '+r['status']] for r in sorted(a['risks'],key=lambda r:(r['priority'],-r['score']))])
    paragraph(b,a['deadline_basis']+' Primeiro, tratar continuidade e controle de acesso. Depois, ampliar a observação externa e a retenção de evidências. A implantação desses controles é trabalho futuro; esta sprint entrega a análise e o plano preliminar.')
    paragraph(b,'Rastreabilidade das fontes utilizadas:')
    table(b,['ID','Fonte','Origem no repositório','SHA-256'],[[s['id'],s['label'],s['origin'],s['sha256']] for s in a['sources']])
    return sections


def indicators(a):
    c,q=a['counts'],a['quality'];lat=next(m for m in a['metrics'] if m['key']=='clinical_p95_ms')
    return [
      {'name':'KPI · Disponibilidade assistencial','value':fmt(q['availability_percent'])+'%','target':'≥99%','decision':'Baseline 100%; queda induzida explica o desvio. Priorizar R-01. E03'},
      {'name':'KPI · Pico de latência p95','value':fmt(lat['experiment']['peak'])+' ms','target':'≤500 ms','decision':'Próximo ao baseline; manter capacidade. E02'},
      {'name':'KPI · Cobertura ao final','value':'100% (7/7)','target':'100%','decision':'Recuperada após mínimo de 85,71%; tratar R-04. E03'},
      {'name':'KPI · Incidentes abertos / fechados','value':str(c['incidents_open'])+' / '+str(c['incidents_closed']),'target':'0 abertos ao final','decision':'Dois episódios encerrados; manter ações preventivas. E03 E05'},
      {'name':'KPI · MTTD (n=2)','value':fmt(c['mttd_seconds'])+' s','target':'≤120 s','decision':'Dentro da referência proposta; ampliar observação externa. E03 E05'},
      {'name':'KPI · MTTR após detecção (n=2)','value':fmt(c['mttr_seconds'])+' s','target':'≤60 s','decision':'Resposta automatizada; testar procedimento operacional futuramente. E03 E05'},
      {'name':'KRI · Falhas de login no cenário','value':str(a['events']['invalid_logins'])+' em menos de 1 min','target':'Investigar ≥5/min','decision':'Sinal de repetição; nenhum acesso indevido comprovado. Tratar R-03. E04 E05'},
      {'name':'KRI · Vulnerabilidades altas','value':str(c['vulnerabilities_by_severity'].get('Alta',0)),'target':'0 sem tratamento','decision':'Primeiro inventário; priorizar autorização e persistência. C01 C02 C03'},
      {'name':'KRI · Riscos altos/críticos','value':str(c['risks_high_critical'])+' de '+str(len(a['risks'])),'target':'0 sem responsável/plano','decision':'Primeira avaliação; executar tratamentos antes de reduzir classificação.'},
      {'name':'KPI · Riscos com tratamento definido','value':fmt(c['risks_with_treatment_percent'],0)+'%','target':'100%','decision':'Todos planejados; acompanhar execução, prazo e evidência de conclusão.'}]


def render_report(a):
    def text(value, mode):
        value=str(value)
        value=html.escape(value) if mode=='html' else value.replace('|','\\|').replace('\n',' ')
        return re.sub(r'\b(?:B|E|C)\d{2}\b',lambda m: '<a href="/analysis/sprint2/source/'+m[0]+'">'+m[0]+'</a>' if mode=='html' else '['+m[0]+'](../analysis/sprint2/sources/'+m[0]+'.txt)',value)
    md=['# Modelo 03 — Relatório da Sprint 2 | Analisar','']
    body=['<h1>Relatório da Sprint 2 <span>Analisar</span></h1><p class="subtitle">Coleta de 26/10/2026 · Governança em Cibersegurança · Saúde</p>']
    for title,blocks in report_blocks(a):
        md+=['## '+title,''];body.append('<section><h2>'+html.escape(title)+'</h2>')
        for kind,value in blocks:
            if kind=='p':
                md += [text(value,'md'),''];body.append('<p>'+text(value,'html')+'</p>')
            else:
                headers,rows=value
                md+=['| '+' | '.join(text(v,'md') for v in headers)+' |','| '+' | '.join('---' for _ in headers)+' |']
                md+=['| '+' | '.join(text(v,'md') for v in row)+' |' for row in rows]+['']
                body.append('<div class="table"><table><thead><tr>'+''.join('<th>'+text(h,'html')+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+text(v,'html')+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table></div>')
        body.append('</section>')
    (ROOT/'docs/relatorio-sprint2.md').write_text('\n'.join(md))
    page='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório da Sprint 2</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#17283b;background:#f3f6fa;margin:0}main{max-width:1200px;margin:40px auto;padding:40px;background:white;border-radius:12px}h1{font-size:34px;line-height:1.2}h1 span{color:#177c89}h2{font-size:23px;border-bottom:2px solid #dfe8ef;padding-bottom:10px;margin-top:42px}.subtitle{color:#526377}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:16px 0}th{background:#173d53;color:white;text-align:left}td,th{padding:10px 12px;border-bottom:1px solid #dfe8ef;vertical-align:top}td{min-width:70px;overflow-wrap:anywhere}tr:nth-child(even){background:#f3f7fa}a{color:#087787}nav{display:flex;gap:20px}@media(max-width:700px){main{margin:0;padding:20px}}@media print{body{background:white}main{padding:0;margin:0}nav{display:none}h2{break-after:avoid}tr{break-inside:avoid}.table{overflow:visible}table{font-size:10px}}</style><main><nav><a href="http://localhost:3001/d/saude-v01">Dashboard v0.2</a><a href="/analysis/sprint2/data">Dados e fontes</a></nav>'+''.join(body)+'</main></html>'
    (OUTPUT/'report.html').write_text(page)


def main():
    registers=read(OUTPUT/'registers.json')
    a=build_analysis(BASELINE,EXPERIMENT,registers)
    source_specs=[('B01','Manifesto do baseline',BASELINE/'manifest.json'),('B02','Curvas do baseline',BASELINE/'derived.json'),('B03','Séries originais do baseline',BASELINE/'series.json'),
                  ('E01','Manifesto do experimento',EXPERIMENT/'manifest.json'),('E02','Curvas do experimento',EXPERIMENT/'derived.json'),('E03','Séries originais do experimento',EXPERIMENT/'series.json'),
                  ('E04','Eventos da API',EXPERIMENT/'events.jsonl'),('E05','Timeline do experimento',EXPERIMENT/'session.json'),
                  ('C01','Compose da coleta',EXPERIMENT/'configuration/infra/compose.yaml'),('C02','Autenticação e autorização',ROOT/'apps/api/app.ts'),
                  ('C03','Consulta ao banco',ROOT/'apps/api/repository.ts'),('C04','Regras de alerta da coleta',EXPERIMENT/'configuration/monitoring/rules.yml'),
                  ('C05','Retenção e logs locais',ROOT/'logging/README.md'),('C06','Renovação do token do gerador',ROOT/'apps/lab/server.ts')]
    source_dir=OUTPUT/'sources';source_dir.mkdir(parents=True,exist_ok=True)
    a['sources']=[]
    for identifier,label,path in source_specs:
        target=source_dir/(identifier+'.txt');shutil.copyfile(path,target)
        a['sources'].append({'id':identifier,'label':label,'origin':str(path.relative_to(ROOT)),'sha256':digest(path),'path':'sources/'+target.name})
    a['indicators']=indicators(a)
    (OUTPUT/'analysis.json').write_text(json.dumps(a,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    render_report(a)
    print(json.dumps({'analysis':str(OUTPUT.relative_to(ROOT)/'analysis.json'),'report':'docs/relatorio-sprint2.md','risks':len(a['risks']),'vulnerabilities':len(a['vulnerabilities']),'incidents':len(a['incidents']),'sources':len(a['sources']),'counts':a['counts']},ensure_ascii=False))


if __name__=='__main__':
    main()
