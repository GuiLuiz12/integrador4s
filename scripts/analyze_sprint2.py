#!/usr/bin/env python3
"""Build Sprint 2 analysis from preserved evidence, independently of scenario acceptance."""
import collections
import hashlib
import json
import math
import statistics

from evidence import ROOT, timestamp, iso
from evidence_analysis import verify_manifest, response_events

BASELINE = ROOT / 'evidence/validated/refinamento-sprint1/baseline'
EXPERIMENT = ROOT / 'evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e'
OUTPUT = ROOT / 'analysis/sprint2'
REVIEW_CHECKPOINT = '536e7c22f3e809db9a7137a3e9bea4e481d0fb5e'
STATIC_ORIGINS = {'C02': 'apps/api/app.ts', 'C03': 'apps/api/repository.ts',
                  'C05': 'logging/README.md', 'C06': 'apps/lab/server.ts'}


def source_specs():
    return [('B01','Manifesto do baseline',BASELINE/'manifest.json'),('B02','Curvas do baseline',BASELINE/'derived.json'),('B03','Séries originais do baseline',BASELINE/'series.json'),
            ('E01','Manifesto do experimento',EXPERIMENT/'manifest.json'),('E02','Curvas do experimento',EXPERIMENT/'derived.json'),('E03','Séries originais do experimento',EXPERIMENT/'series.json'),
            ('E04','Eventos da API',EXPERIMENT/'events.jsonl'),('E05','Timeline do experimento',EXPERIMENT/'session.json'),
            ('C01','Compose da coleta',EXPERIMENT/'configuration/infra/compose.yaml'),('C02','Autenticação e autorização',OUTPUT/'sources/C02-app.ts'),
            ('C03','Consulta ao banco',OUTPUT/'sources/C03-repository.ts'),('C04','Regras de alerta da coleta',EXPERIMENT/'configuration/monitoring/rules.yml'),
            ('C05','Retenção e logs locais',OUTPUT/'sources/C05-README.md'),('C06','Renovação do token do gerador',OUTPUT/'sources/C06-server.ts'),
            ('C07','Inventário e avaliação qualitativa de riscos',OUTPUT/'registers.json')]


def line_reference(source, needle, lines=1, fragment=False):
    path = next(path for identifier, _, path in source_specs() if identifier == source)
    content = path.read_text().splitlines()
    start = next(i for i, line in enumerate(content) if needle in line)
    return {'source': source, 'locator': f'linhas {start+1}–{start+lines}',
            'observation': needle if fragment else '\n'.join(line.strip() for line in content[start:start+lines])}


def figure_catalog():
    figures = []
    for identifier, title, section, path in [
        ('F01','Baseline e tendências',3,ROOT/'evidence/sprint2/fechamento/baseline.png'),
        ('F02','Matriz e registro de riscos',6,ROOT/'evidence/sprint2/fechamento/riscos.png'),
        ('F03','Inventário de vulnerabilidades',5,ROOT/'evidence/sprint2/fechamento/vulnerabilidades.png'),
        ('F04','Incidentes e episódios de alerta',7,ROOT/'evidence/sprint2/fechamento/incidentes.png'),
        ('F05','Alerta de indisponibilidade assistencial em firing',7,EXPERIMENT/'captures/alerts/ConsultaAssistencialIndisponivel/dashboard.png'),
        ('F06','Alerta de falha de coleta em firing',7,EXPERIMENT/'captures/alerts/FalhaDeColeta/dashboard.png'),
    ]:
        metadata = path.parent/'validation.json' if identifier in ('F01','F02','F03','F04') else path.parent/'observation.json'
        figures.append({'id':identifier,'title':title,'section':section,'origin':str(path.relative_to(ROOT)),
                        'sha256':digest(path),'captured_at':read(metadata)['captured_at']})
    return figures


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


def fmt(value, digits=2):
    return '—' if value is None else f'{value:.{digits}f}'.replace('.', ',')


def build_analysis(baseline, experiment, registers):
    b, e = load_session(baseline), load_session(experiment)
    raw, manifest = e['raw'], e['manifest']
    session_events = read(experiment / 'session.json')
    timeline = {entry['event']: entry for entry in session_events}
    def event_reference(name):
        index, event = next((i, entry) for i, entry in enumerate(session_events) if entry['event'] == name)
        return {'source':'E05','locator':f'/{index} · event={name}', 'observation':event['at']+' · '+event['event']}
    events = response_events([json.loads(line) for line in (experiment / 'events.jsonl').read_text().splitlines()])
    episodes = alert_episodes(raw['alert_history']['data']['result'], manifest['scrape_interval_seconds'])
    incidents = []
    incident_timeline = []
    specs = [('INC-01', 'Indisponibilidade assistencial', 'DB-01', 'Crítica', 'ConsultaAssistencialIndisponivel',
              'postgres_outage_confirmed', 'postgres_restart_requested', 'probe_history', {}, 'R-01'),
             ('INC-02', 'Perda de observabilidade', 'MON-01', 'Média', 'FalhaDeColeta',
              'probe_outage_confirmed', 'probe_restore_requested', 'targets', {'job': 'probe'}, 'R-04')]
    for identifier, category, asset, severity, alert, onset_key, response_key, family, labels, risk in specs:
        onset = timestamp(timeline[onset_key]['at'])
        response = timestamp(timeline[response_key]['at'])
        detected = next((timestamp(x['started_at']) for x in episodes if x['alert'] == alert and timestamp(x['started_at']) >= onset), None)
        recovered = next((t for t, value in points(raw, family, **labels) if t >= response and value == 1), None)
        references = [event_reference(onset_key), event_reference(response_key),
                      {'source':'E03','locator':'/queries/alert_history', 'observation':alert+' · primeiro firing '+iso(detected) if detected is not None else alert+' · detecção não observada'},
                      {'source':'E03','locator':'/queries/'+family, 'observation':'primeira amostra = 1 após restauração: '+iso(recovered) if recovered is not None else 'recuperação não observada'}]
        incidents.append({'id': identifier, 'category': category, 'asset': asset, 'severity': severity,
                          'status': 'Fechado' if recovered is not None else 'Aberto', 'risk': risk,
                          'onset': iso(onset), 'detected': iso(detected) if detected else None,
                          'response': iso(response), 'recovered': iso(recovered) if recovered else None,
                          'response_seconds': response - onset,
                          'detection_seconds': detected - onset if detected else None,
                          'recovery_seconds': recovered - detected if recovered is not None and detected is not None else None,
                          'impact_seconds': recovered - onset if recovered is not None else None,
                          'owner': 'Operação de TI', 'response_actor': 'Roteiro automatizado', 'evidence': ['E03', 'E05'],
                          'technical_evidence':references})
        steps = [(onset,'Interrupção confirmada',references[0]),(response,'Restauração solicitada pelo roteiro',references[1])]
        if detected is not None: steps.append((detected,'Alerta em firing: '+alert,references[2]))
        if recovered is not None: steps.append((recovered,'Recuperação observada',references[3]))
        incident_timeline.extend({'incident':identifier,'at':iso(t),'step':label,'reference':ref} for t,label,ref in steps)
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
    expected = len({series['metric']['job'] for series in raw['targets']['data']['result']})
    coverage_percent = points(raw,'coverage')
    technical = {
        'VUL-01':[line_reference('C02','await request.jwtVerify();',2),line_reference('C02','const record = await repository.record'),line_reference('C03','SELECT id, paciente')],
        'VUL-02':[line_reference('C02',"app.post<{ Body:"),line_reference('C02','if (!professional || !valid)',4),
                  {'source':'E04','locator':'event=authentication; status=401 (respostas únicas)','observation':f'{invalid} tentativas recusadas'},event_reference('ten_invalid_logins_completed')],
        'VUL-03':[line_reference('C01','  postgres:',3),event_reference('postgres_outage_confirmed'),
                  {'source':'E04','locator':'status=503; event=record_access (traffic=clinical) ou authentication','observation':f'{record503} consultas e {auth503} autenticações indisponíveis'}],
        'VUL-04':[line_reference('C01','  prometheus:',3),line_reference('C01','  grafana:',3),
                  {'source':'E03','locator':'/queries/targets · job=probe','observation':f'{sum(v==0 for _,v in points(raw,"targets",job="probe"))} amostras up=0; cobertura mínima {fmt(min(v for _,v in coverage_percent))}%'},event_reference('probe_outage_confirmed')],
        'VUL-05':[line_reference('C01','  driver: json-file',4),line_reference('C05','Os logs continuam locais nesta etapa.',fragment=True)],
    }
    vulnerabilities = [dict(v,technical_evidence=technical[v['id']]) for v in registers['vulnerabilities']]
    risks = [dict(r, score=r['probability'] * r['impact'], level=risk_level(r['probability'] * r['impact']),
                  technical_evidence=technical[r['vulnerability']]) for r in registers['risks']]
    exposures = []
    for asset in dict.fromkeys(v['asset'] for v in vulnerabilities):
        findings = [v for v in vulnerabilities if v['asset']==asset]
        exposures.append({'asset':asset,'findings':[v['id'] for v in findings],
                          'by_severity':dict(collections.Counter(v['severity'] for v in findings)),
                          'exposure':' '.join(v['exposure'] for v in findings),
                          'evidence':sorted({source for v in findings for source in v['evidence']})})
    max_gap = max(right[0]-left[0] for name in ('container_cpu','container_memory','container_network_receive','container_network_transmit')
                  for series in raw[name]['data']['result'] for left,right in zip(series['values'],series['values'][1:]))
    counts = {'risks_high_critical':sum(r['score']>=10 for r in risks),'risks_critical':sum(r['score']>=17 for r in risks),
              'risks_with_treatment_percent':100*sum(bool(r['treatment'] and r['action'] and r['owner'] and r['deadline_days']) for r in risks)/len(risks),
              'vulnerabilities_by_severity':dict(collections.Counter(v['severity'] for v in registers['vulnerabilities'])),
              'vulnerabilities_by_asset':dict(collections.Counter(v['asset'] for v in registers['vulnerabilities'])),
              'alerts_by_severity':dict(collections.Counter(v['severity'] for v in episodes)),
              'incidents_open':sum(i['status']=='Aberto' for i in incidents),'incidents_closed':sum(i['status']=='Fechado' for i in incidents),
              'mttd_seconds':statistics_of(i['detection_seconds'] for i in incidents if i['detection_seconds'] is not None)['mean'],
              'mttr_seconds':statistics_of(i['recovery_seconds'] for i in incidents if i['recovery_seconds'] is not None)['mean']}
    query_specs = [('Q01','CPU dos serviços','derived','container_cpu_cores'),('Q02','Memória dos serviços','raw','container_memory'),
                   ('Q03','Tráfego dos serviços','derived','container_network_bytes_per_second'),('Q04','Latência p95','derived','clinical_p95'),
                   ('Q05','Disponibilidade funcional','raw','probe_history'),('Q06','CPU do host','derived','host_cpu_percent'),
                   ('Q07','Memória do host','derived','host_memory_percent'),('Q08','Volume clínico','derived','clinical_volume'),
                   ('Q09','Erros clínicos','derived','clinical_errors_percent'),('Q10','Coleta por alvo','raw','targets'),('Q11','Alertas','raw','alert_history')]
    queries = [{'id':identifier,'metric':label,'locator':'/queries/'+name,
                'baseline':{'source':'B02' if family=='derived' else 'B03','promql':b[family][name]['promql']},
                'experiment':{'source':'E02' if family=='derived' else 'E03','promql':e[family][name]['promql']}}
               for identifier,label,family,name in query_specs]
    return {'schema_version':1,'title':'Sprint 2 — Analisar','baseline':{'session_id':b['manifest']['session_id'],'start':b['manifest']['range_start'],'end':b['manifest']['range_end']},
            'experiment':{'session_id':manifest['session_id'],'start':manifest['range_start'],'end':manifest['range_end'],'duration_seconds':duration},
            'quality':{'observations':len(probe),'successes':successes,'failures':len(probe)-successes,'availability_percent':100*successes/len(probe),
                       'completeness_percent':100*len(probe)/(duration/15),'maximum_container_gap_seconds':max_gap,
                       'collection_final_percent':coverage_percent[-1][1],'collection_minimum_percent':min(v for _,v in coverage_percent),'expected_targets':expected,
                       'legacy_acceptance':'Rejeitado pelo critério de mínimo de 60 erros 503 na consulta; uso analítico autorizado com essa limitação declarada.'},
            'events':{'invalid_logins':invalid,'authentication_503':auth503,'clinical_record_503':record503},
            'metrics':comparison,'phases':phases,'incidents':incidents,'incident_timeline':sorted(incident_timeline,key=lambda step:step['at']),
            'alert_episodes':episodes,'counts':counts,'queries':queries,'exposures':exposures,
            'vulnerabilities':vulnerabilities,'risks':risks,'risk_method':registers['method'],
            'probability_scale':registers['probability_scale'],'impact_scale':registers['impact_scale'],'deadline_basis':registers['deadline_basis']}


def indicators(a):
    c,q=a['counts'],a['quality'];lat=next(m for m in a['metrics'] if m['key']=='clinical_p95_ms')
    result=[]
    def add(name,value,target,decision,*references):
        result.append({'name':name,'value':value,'target':target,'decision':decision,
                       'technical_evidence':[{'source':source,'locator':locator,'observation':observation} for source,locator,observation in references]})
    add('KPI · Disponibilidade assistencial',fmt(q['availability_percent'])+'%','≥99%',
        'Baseline 100%; queda induzida explica o desvio. Priorizar R-01.',('E03','/queries/probe_history',f'{q["successes"]}/{q["observations"]} verificações bem-sucedidas'))
    for key in ('api_cpu_percent','api_memory_percent','postgres_cpu_percent','postgres_memory_percent','host_cpu_percent','host_memory_percent'):
        m=next(m for m in a['metrics'] if m['key']==key)
        source='E03' if key.endswith('memory_percent') and not key.startswith('host') else 'E02'
        query='container_memory' if source=='E03' else 'container_cpu_cores' if key in ('api_cpu_percent','postgres_cpu_percent') else key
        add('KPI · '+m['metric']+' · média / pico',fmt(m['experiment']['mean'])+'% / '+fmt(m['experiment']['peak'])+'%','≤80%',
            'Baseline '+fmt(m['baseline']['mean'])+'% / '+fmt(m['baseline']['peak'])+'%. '+m['interpretation'],
            (source,'/queries/'+query,'Média e máximo das amostras; denominador e conversões em §3.'))
    add('KPI · Pico de latência p95',fmt(lat['experiment']['peak'])+' ms','≤500 ms','Próximo ao baseline; manter capacidade.',('E02','/queries/clinical_p95','Máximo da curva p95 de cinco minutos; apenas respostas 200.'))
    add('KPI · Cobertura ao final',fmt(q['collection_final_percent'])+'%','100%',f'Recuperada após mínimo de {fmt(q["collection_minimum_percent"])}%; tratar R-04.',('E03','/queries/coverage','Última amostra e mínimo de lab:collection_coverage_percent.'))
    add('KPI · Alertas por criticidade',f'{c["alerts_by_severity"].get("critical",0)} crítico; {c["alerts_by_severity"].get("warning",0)} aviso','Investigar cada episódio',
        'Um episódio crítico e um de aviso em firing; ambos encerrados.',('E03','/queries/alert_history','Agrupamento por labels, lacuna máxima de 30 s; pending excluído.'))
    add('KRI · Vulnerabilidades por severidade','; '.join(f'{c["vulnerabilities_by_severity"].get(s,0)} {s.lower()}' for s in ('Crítica','Alta','Média','Baixa')),
        '0 altas/críticas sem plano','Primeiro inventário; priorizar autorização e persistência.',('C07','/vulnerabilities','Contagem por severity; fontes técnicas por achado em §5.'))
    exposure_value='; '.join(x['asset']+': '+str(len(x['findings']))+' ('+', '.join(f'{n} {s.lower()}' for s,n in x['by_severity'].items())+')' for x in a['exposures'] if x['asset'] in ('APP-01','DB-01'))
    add('KRI · Ativos com maior exposição',exposure_value,'Priorizar acesso e continuidade',
        'APP concentra achados e superfícies de acesso; DB é dependência crítica. MON/LOG: 1 médio cada. Sem pontuação adicional.',
        ('C07','/vulnerabilities','Agrupamento por asset e severity, contexto de exposure; sustentação técnica em §5.'))
    add('KPI · Incidentes abertos / fechados',str(c['incidents_open'])+' / '+str(c['incidents_closed']),'0 abertos ao final','Manter ações preventivas.',('E03','/queries/probe_history e /queries/targets','Recuperação observada após as ações de E05; timeline em §7.'))
    add('KPI · MTTD (n='+str(len(a['incidents']))+')',fmt(c['mttd_seconds'])+' s','≤120 s','Dentro da referência proposta; ampliar observação externa.',('E03','/queries/alert_history','Média da primeira amostra firing menos início confirmado em E05.'))
    add('KPI · MTTR após detecção (n='+str(len(a['incidents']))+')',fmt(c['mttr_seconds'])+' s','≤60 s','Resposta automatizada; testar procedimento operacional futuramente.',('E03','/queries/probe_history e /queries/targets','Média da primeira amostra saudável após restauração de E05 menos detecção.'))
    add('KRI · Falhas de login no cenário',str(a['events']['invalid_logins'])+' em menos de 1 min','Investigar ≥5/min','Sinal de repetição; nenhum acesso indevido comprovado. Tratar R-03.',('E04','event=authentication; status=401','Contagem de respostas únicas; intervalo de execução em E05.'))
    add('KRI · Riscos altos/críticos',f'{c["risks_high_critical"]-c["risks_critical"]} altos; {c["risks_critical"]} crítico','0 sem responsável/plano','Primeira avaliação; executar tratamentos antes de reduzir classificação.',('C07','/risks','P × I: alto 10–16, crítico 17–25; 4 de 5 riscos.'))
    add('KPI · Riscos com tratamento definido',fmt(c['risks_with_treatment_percent'],0)+'%','100%','Todos planejados; acompanhar execução, prazo e evidência de conclusão.',('C07','/risks','Percentual com estratégia, ação, responsável e prazo definidos; não significa mitigação.'))
    return result


def main():
    registers=read(OUTPUT/'registers.json')
    a=build_analysis(BASELINE,EXPERIMENT,registers)
    a['figures']=figure_catalog()
    a['sources']=[]
    for identifier,label,path in source_specs():
        preserved_path=str(path.relative_to(ROOT))
        source={'id':identifier,'label':label,'origin':STATIC_ORIGINS.get(identifier,preserved_path),
                'sha256':digest(path),'path':preserved_path}
        if identifier in STATIC_ORIGINS:
            source['review_checkpoint']=REVIEW_CHECKPOINT
        a['sources'].append(source)
    a['indicators']=indicators(a)
    (OUTPUT/'analysis.json').write_text(json.dumps(a,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'analysis':str(OUTPUT.relative_to(ROOT)/'analysis.json'),'risks':len(a['risks']),'vulnerabilities':len(a['vulnerabilities']),'incidents':len(a['incidents']),'sources':len(a['sources']),'counts':a['counts']},ensure_ascii=False))


if __name__=='__main__':
    main()
