#!/usr/bin/env python3
"""Consolidate Sprint 3 evidence and governance records; never render reports."""
import collections
import copy
import hashlib
import json
import pathlib
import statistics

from evidence import ROOT, timestamp, iso
from evidence_analysis import response_events, summarize, verify_manifest
from analyze_sprint2 import risk_level

OUTPUT = ROOT / 'analysis/sprint3'
ALERT = 'FalhasDeLoginRepetidas'


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def reference(source, locator, observation):
    return {'source': source, 'locator': locator, 'observation': observation}


def check_reference(source, key, checks, observations):
    if key in observations:
        observation = copy.deepcopy(observations[key])
        # Keep complete responses in the original verification file, not copied into every risk/action.
        if isinstance(observation, dict) and isinstance(observation.get('result'), list):
            observation['result'] = [
                {field: value[field] for field in ('session_id', 'result', 'started_at', 'completed_at',
                                                   'observations', 'successful_probes', 'invalid_login_events') if field in value}
                if isinstance(value, dict) and 'session_id' in value and 'result' in value else value
                for value in observation['result']]
        return reference(source, '/observations/' + key, json.dumps(observation, ensure_ascii=False))
    require(checks.get(key) is not True, f'Verificação positiva sem resultado técnico: {key}')
    return reference(source, '/observations', key + ': verificação não apresentada; situação pendente, sem execução presumida')


def control_assessment(definitions, checks, source, observations):
    """Only observed boolean successes satisfy a control; partial is not implemented."""
    controls = []
    for definition in definitions:
        item = copy.deepcopy(definition)
        required = item['checks']
        require(required, f"Controle sem verificação: {item['id']}")
        results = [checks.get(key) is True for key in required]
        item['status'] = 'Implementado' if all(results) else 'Parcial' if any(results) else 'Pendente'
        item['technical_evidence'] = [check_reference(source, key, checks, observations)
                                      for key in required]
        controls.append(item)
    return controls


def control_counts(controls, risks):
    applicable = [c for c in controls if c.get('applicable', True)]
    statuses = collections.Counter(c['status'] for c in applicable)
    high = {r['id'] for r in risks if r['score'] >= 10}
    return {'applicable': len(applicable), 'implemented': statuses['Implementado'],
            'partial': statuses['Parcial'], 'pending': statuses['Pendente'],
            'compliance_percent': 100 * statuses['Implementado'] / len(applicable) if applicable else None,
            'critical_gaps': sum(c['status'] != 'Implementado' and bool(set(c['risks']) & high) for c in applicable)}


def action_assessment(definitions, checks, source, observations):
    actions = []
    for definition in definitions:
        item = copy.deepcopy(definition)
        require(item['checks'], f"Ação sem verificação: {item['id']}")
        complete = all(checks.get(key) is True for key in item['checks'])
        item['status'] = 'Concluída' if complete else 'Planejada'
        item['completion_evidence'] = [check_reference(source, key, checks, observations)
                                       for key in item['checks']] if complete else []
        actions.append(item)
    return actions


def incident_from(identifier, session, events, raw, refs):
    require(session.get('status') == 'completed', f'{identifier}: sessão incompleta')
    timeline = session['timeline']
    required = ['auth_failure_confirmed', 'auth_alert_firing', 'auth_generator_stopped', 'auth_recovery_confirmed']
    steps = []
    for name in required:
        matches = [(i, e) for i, e in enumerate(timeline) if e['event'] == name]
        require(len(matches) == 1, f'{identifier}: evento obrigatório ausente ou duplicado: {name}')
        index, event = matches[0]
        steps.append((timestamp(event['at']), reference(refs['timeline'], f'/timeline/{index}', name + ' · ' + event['at'])))
    onset, detected, action, closed = [step[0] for step in steps]
    require(onset <= detected <= action <= closed, f'{identifier}: cronologia inválida; resposta deve seguir detecção')
    responses = response_events(events)
    failures = [e for e in responses if e['event'] == 'authentication' and e.get('status') == 401]
    require(len(failures) >= 5, f'{identifier}: eventos não sustentam cinco falhas de login')
    first, last = min(e['time'] for e in failures) / 1000, max(e['time'] for e in failures) / 1000
    require(abs(first - onset) <= 2, f'{identifier}: início diverge do primeiro 401')
    require(closed - last >= 60, f'{identifier}: encerramento sem 60 segundos livres de falhas')
    firing = sorted(float(t) for series in raw['queries']['alert_history']['data']['result']
                    if series['metric'].get('alertname') == ALERT and series['metric'].get('alertstate') == 'firing'
                    for t, value in series['values'] if float(value) == 1 and float(t) >= onset)
    require(firing, f'{identifier}: disparo ausente das séries originais')
    require(abs(firing[0] - detected) <= 15, f'{identifier}: detecção diverge da primeira amostra de disparo')
    proof = [r for _, r in steps] + [reference(refs['events'], 'event=authentication; status=401',
                                             f'{len(failures)} respostas recusadas; contagem por serviço/instância/correlação'),
                                    reference(refs['series'], '/queries/alert_history', ALERT + ' em firing')]
    return {'id': identifier, 'session_id': session['session_id'], 'category': 'Tentativas repetidas de autenticação',
            'asset': 'APP-01', 'risk': 'R-03', 'severity': 'Média', 'status': 'Fechado',
            'owner': 'Segurança de TI', 'response_actor': 'Roteiro automatizado',
            'onset': iso(onset), 'detected': iso(detected), 'response': iso(action), 'recovered': iso(closed),
            'detection_seconds': detected - onset, 'response_seconds': action - detected,
            'recovery_seconds': closed - detected, 'failed_logins': len(failures),
            'impact': 'Tentativas recusadas; sem evidência de comprometimento. Consulta legítima verificada no encerramento.',
            'containment': 'Interrupção do gerador de tentativas simuladas; bloqueio de tentativas não implementado.',
            'technical_evidence': proof,
            'timeline': [{'at': iso(t), 'step': name, 'reference': ref} for name, (t, ref) in zip(required, steps)]}


def build_analysis(registers, root=ROOT):
    historic = read(root / 'analysis/sprint2/analysis.json')
    sources = copy.deepcopy(historic['sources'])

    def source(identifier, path, kind, label, period=None):
        path = root / path
        require(path.resolve().is_relative_to(root.resolve()) and not path.is_symlink(), f'Fonte fora do projeto: {path}')
        require(path.is_file(), f'Fonte obrigatória ausente: {path}')
        item = {'id': identifier, 'path': str(path.relative_to(root)), 'origin': str(path.relative_to(root)),
                'kind': kind, 'label': label, 'sha256': digest(path)}
        if period:
            item['period'] = period
        sources.append(item)
        return read(path) if path.suffix == '.json' else path

    initial = source('S3-INI', registers['initial_checkpoint'], 'checkpoint', 'Verificações antes da Sprint 3')
    runtime = source('S3-VAL', registers['verification'], 'verification', 'Verificações técnicas após a Sprint 3')
    for prefix, checkpoint in [('INI', initial), ('VAL', runtime)]:
        for i, entry in enumerate(checkpoint.get('sources', []), 1):
            path = root / entry['path']
            require(path.is_file() and digest(path) == entry['sha256'], f'Fonte de verificação alterada: {path}')
            source(f'S3-{prefix}-{i:02}', entry['path'], 'verification_source', entry.get('label', entry['path']))
    for key in ('captured_at', 'checks', 'observations'):
        require(key in initial and key in runtime, f'Checkpoint sem {key}')
    controls = control_assessment(registers['controls'], runtime['checks'], 'S3-VAL', runtime['observations'])
    previous_controls = control_assessment(registers['controls'], initial['checks'], 'S3-INI', initial['observations'])
    risks = copy.deepcopy(historic['risks'])
    actions = action_assessment(registers['actions'], runtime['checks'], 'S3-VAL', runtime['observations'])
    for risk in risks:
        risk['inherent'] = {'probability': risk['probability'], 'impact': risk['impact'], 'score': risk['score'], 'level': risk['level']}
        risk['residual'] = {**risk['inherent'], 'assessed_at': runtime['captured_at'],
                            'rationale': 'Avaliação conservadora: as melhorias de detecção e investigação não demonstram redução de probabilidade ou impacto. P/I preservados.',
                            'controls': [c['id'] for c in controls if risk['id'] in c['risks'] and c['status'] == 'Implementado']}
        risk['actions'] = [a['id'] for a in actions if a['risk'] == risk['id']]
        risk['status'] = 'Em tratamento' if any(a['risk'] == risk['id'] and a['status'] == 'Concluída' for a in actions) else 'Planejado'
        risk['technical_evidence'] += [ref for c in controls if risk['id'] in c['risks'] for ref in c['technical_evidence']]
    incidents = []
    sessions = []
    for i, spec in enumerate(registers['sessions'], 1):
        folder = root / spec['path']
        manifest = verify_manifest(folder)
        summary = summarize(folder)
        require(summary['result'] == 'passed' and summary['kind'] == 'security', 'A simulação deve passar pelas verificações de segurança')
        require(manifest.get('inventory_profile') == 'sprint3', 'A sessão deve usar o inventário Sprint 3')
        prefix = f'S3-E{i}'
        period = {'start': manifest['range_start'], 'end': manifest['range_end']}
        source(prefix + '-MAN', spec['path'] + '/manifest.json', 'manifest', 'Manifesto da simulação', period)
        session = source(prefix + '-TIM', spec['path'] + '/session.json', 'timeline', 'Timeline da simulação', period)
        raw = source(prefix + '-SER', spec['path'] + '/series.json', 'metrics', 'Séries originais', period)
        event_path = source(prefix + '-LOG', spec['path'] + '/events.jsonl', 'logs', 'Eventos exportados do Loki', period)
        events = [json.loads(line) for line in event_path.read_text().splitlines() if line.strip()]
        item = incident_from(spec['id'], session, events, raw,
                             {'timeline': prefix + '-TIM', 'series': prefix + '-SER', 'events': prefix + '-LOG'})
        incidents.append(item)
        # Every exported file remains addressable with its original extension and manifest hash.
        for n, name in enumerate(sorted(manifest['files']), 1):
            if name in {'session.json', 'series.json', 'events.jsonl'}:
                continue
            source(prefix + f'-SRC{n:02}', spec['path'] + '/' + name, 'exported_source', name, period)
        sessions.append({'id': session['session_id'], 'incident': spec['id'], 'path': spec['path'], **period})
    require(len(incidents) == 2, 'A entrega requer duas simulações completas e separadas')
    require(len({i['session_id'] for i in incidents}) == 2, 'Sessões repetidas não são duas simulações')
    require(timestamp(sessions[0]['end']) < timestamp(sessions[1]['start']), 'Simulações devem ter intervalos separados')
    counts = control_counts(controls, risks)
    counts.update({'risks_high_critical': sum(r['score'] >= 10 for r in risks),
                   'residual_risks_high_critical': sum(r['residual']['score'] >= 10 for r in risks),
                   'risks_with_treatment_percent': 100 * sum(bool(r['actions']) for r in risks) / len(risks),
                   'actions_total': len(actions), 'actions_completed': sum(a['status'] == 'Concluída' for a in actions),
                   'incidents_open': 0, 'incidents_closed': len(incidents), 'security_samples': len(incidents),
                   'mttd_seconds': statistics.mean(i['detection_seconds'] for i in incidents),
                   'mttr_seconds': statistics.mean(i['recovery_seconds'] for i in incidents),
                   'response_seconds': statistics.mean(i['response_seconds'] for i in incidents),
                   'failed_logins': sum(i['failed_logins'] for i in incidents),
                   'alerts_by_severity': {'warning': len(incidents)}})
    for action in actions:
        risk = next(r for r in risks if r['id'] == action['risk'])
        action['technical_evidence'] = copy.deepcopy(risk['technical_evidence']) + action['completion_evidence']
    vulnerabilities = copy.deepcopy(historic['vulnerabilities'])
    for vulnerability in vulnerabilities:
        vulnerability['historical_finding'] = True
        vulnerability['current_status'] = 'Achado permanece; tratamentos não concluídos'
        if vulnerability['id'] == 'VUL-05' and runtime['checks'].get('loki_query') is True:
            vulnerability['current_status'] = 'Tratamento parcial; armazenamento central no mesmo host'
        if vulnerability['id'] == 'VUL-02' and runtime['checks'].get('auth_alert') is True:
            vulnerability['current_status'] = 'Detecção verificada; limitação de tentativas pendente'
        related = [r for r in risks if r['vulnerability'] == vulnerability['id']]
        vulnerability['technical_evidence'] += [ref for r in related for ref in r['technical_evidence'] if ref['source'].startswith('S3-')]
    checkpoints = [
        {'label': 'Inicial', 'at': initial['captured_at'], 'source': 'S3-INI', **control_counts(previous_controls, risks)},
        {'label': 'Após validação', 'at': runtime['captured_at'], 'source': 'S3-VAL', **control_counts(controls, risks)}]
    analysis = {'schema_version': 1, 'title': 'Sprint 3 — Integrar e comunicar',
                'assessed_at': runtime['captured_at'], 'reference': 'Diretriz interna do projeto; não representa certificação ou conformidade legal.',
                'sessions': sessions, 'counts': counts, 'controls': controls, 'initial_controls': previous_controls,
                'actions': actions, 'risks': risks, 'vulnerabilities': vulnerabilities, 'incidents': incidents,
                'historical_incidents': historic['incidents'], 'checkpoints': checkpoints,
                'sources': sources, 'deadline_basis': historic['deadline_basis'],
                'limitations': [
                    'Duas execuções controladas; evolução observada não constitui tendência estatística.',
                    'MTTD/MTTR de autenticação não são agregados aos incidentes de disponibilidade da Sprint 2.',
                    'A ação automatizada encerra o gerador; rate limiting e bloqueio de atacante não foram implementados.',
                    'Retenção de sete dias configurada; não houve sete dias de observação empírica.',
                    'Loki, Alloy e a aplicação dependem do mesmo host; o socket Docker amplia o acesso do coletor.',
                    'Controles e riscos são avaliações qualitativas vinculadas a fontes técnicas; não se comprovam por si mesmos.']}
    analysis['indicators'] = indicators(analysis)
    require(len({s['id'] for s in sources}) == len(sources), 'Identificador de fonte duplicado')
    for item in sources:
        path = root / item['path']
        require(path.is_file() and digest(path) == item['sha256'], f"Fonte ausente ou alterada: {item['id']}")
    known = {s['id'] for s in sources}
    for record in [*controls, *actions, *risks, *vulnerabilities, *incidents, *analysis['indicators']]:
        require(record['technical_evidence'], f"Registro sem sustentação: {record['id']}")
        for ref in record['technical_evidence']:
            require(ref['source'] in known and ref['locator'] and ref['observation'], f'Referência não resolvida: {ref}')
    return analysis


def indicators(a):
    c = a['counts']
    rows = []
    def add(identifier, name, value, target, formula, decision, refs):
        rows.append({'id': identifier, 'name': name, 'value': value, 'target': target, 'formula': formula,
                     'owner': 'Operação / Segurança de TI', 'frequency': 'Por checkpoint ou simulação concluída',
                     'decision': decision, 'technical_evidence': refs})
    proof = [reference('S3-VAL', '/observations', 'Resultados técnicos, comandos e fontes do checkpoint final')]
    incident_proof = [r for i in a['incidents'] for r in i['technical_evidence']]
    add('S3-K01', 'Controles implementados / aplicáveis', f"{c['implemented']}/{c['applicable']} · {c['compliance_percent']:.1f}%", '100%',
        '100 × implementados / aplicáveis; parciais não contam como implementados', 'Priorizar gaps; não representa conformidade legal.', proof)
    add('S3-K02', 'Controles parciais / pendentes', f"{c['partial']} / {c['pending']}", '0 / 0',
        'Contagem por status observado', 'Executar ações pendentes com evidência.', proof)
    add('S3-K03', 'Gaps críticos', str(c['critical_gaps']), '0',
        'Controles incompletos associados a riscos altos/críticos', 'Prioridade de tratamento; não soma riscos duplicados.', proof)
    add('S3-K04', 'Riscos inerentes / residuais altos e críticos', f"{c['risks_high_critical']} / {c['residual_risks_high_critical']}", 'Redução sustentada por controle efetivo',
        'Quantidade de riscos com P × I ≥ 10 em cada avaliação', 'Manter classificação conservadora; detecção não evita comprometimento.', [r for risk in a['risks'] for r in risk['technical_evidence']])
    add('S3-K05', 'Riscos com tratamento definido', f"{c['risks_with_treatment_percent']:.0f}%", '100%',
        '100 × riscos com ações / riscos registrados', 'Tratamento definido não significa concluído.', proof)
    add('S3-K06', 'Ações concluídas / total', f"{c['actions_completed']}/{c['actions_total']}", 'Concluir conforme prioridades e prazos',
        'Contagem de ações com verificações de conclusão', 'Preservar pendências preventivas e de continuidade.', proof)
    add('S3-K07', 'Incidentes de autenticação abertos / fechados', f"{c['incidents_open']} / {c['incidents_closed']}", '0 abertos ao final',
        'Status após confirmação de resolução; n=2', 'Duas simulações; sem taxa de incidentes reais.', incident_proof)
    add('S3-K08', 'MTTD · autenticação', f"{c['mttd_seconds']:.2f} s", '≤120 s (limite do ensaio)',
        'Média(primeiro firing − primeiro 401), n=2', 'Verificar atraso de coleta e avaliação da regra.', incident_proof)
    add('S3-K09', 'MTTR simulado · autenticação', f"{c['mttr_seconds']:.2f} s", 'Encerramento confirmado',
        'Média(encerramento confirmado − primeiro firing), n=2', 'Inclui janela de 60 s sem falhas; não mede recuperação de indisponibilidade.', incident_proof)
    add('S3-K10', 'Tempo até ação automatizada', f"{c['response_seconds']:.2f} s", 'Ação posterior à detecção',
        'Média(interrupção do gerador − primeiro firing), n=2', 'Não interpretar como reação humana.', incident_proof)
    add('S3-K11', 'Falhas de login confirmadas nos logs', str(c['failed_logins']), 'Investigar ≥5 estimadas/min',
        'Respostas authentication 401 únicas por serviço/instância/correlação', 'Correlacionar contador com eventos; sem atribuição de origem.', incident_proof)
    add('S3-K12', 'Alertas de segurança por criticidade', f"Aviso: {c['alerts_by_severity']['warning']}", 'Dois disparos no ensaio',
        'Um episódio confirmado por simulação', 'Distinguir episódios de amostras de firing.', incident_proof)
    return rows


def main():
    analysis = build_analysis(read(OUTPUT / 'registers.json'))
    (OUTPUT / 'analysis.json').write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + '\n')
    print(f"Sprint 3: {len(analysis['controls'])} controles, {len(analysis['incidents'])} incidentes e {len(analysis['indicators'])} indicadores consolidados.")


if __name__ == '__main__':
    main()
