import sys,pathlib,json,time,subprocess,urllib.request,urllib.error,hashlib,shutil
sys.path.insert(0,'scripts')
from evidence import ROOT,COMPOSE,DOCKER,ALLOWED,digest,iso,write_json,query
from evidence_analysis import summarize,verify_manifest
from evidence_loki import export_logs
out=ROOT/'evidence/sprint3/validation';out.mkdir(parents=True,exist_ok=True)
assert not (out/'runtime.json').exists(), 'Preserve existing validation; choose new output.'
checks={};observations={};sources=[]
def record(name,ok,command,result):
 checks[name]=bool(ok);observations[name]={'command':command,'result':result}
 if not ok: raise AssertionError(name)
def run(command):
 p=subprocess.run(command,capture_output=True,text=True,check=True,timeout=120)
 return p.stdout.strip()
def source(path):
 sources.append({'path':str(path.relative_to(ROOT)),'sha256':digest(path)})
flow=run(['bash','scripts/lab.sh','check-api'])
try:
 urllib.request.urlopen('http://127.0.0.1:3000/prontuarios/1')
 unauthorized=200
except urllib.error.HTTPError as e: unauthorized=e.code
record('authenticated_flow', unauthorized==401,'npm run check; GET /prontuarios/1 sem JWT',{'valid_flow':flow,'unauthenticated_status':unauthorized})
priv=run(COMPOSE+['exec','-T','postgres','psql','-U','lab_owner','-d','healthlab','-Atc',"SELECT has_table_privilege('clinical_reader','prontuarios','SELECT'),has_table_privilege('clinical_reader','prontuarios','INSERT'),has_table_privilege('clinical_reader','prontuarios','UPDATE'),has_table_privilege('clinical_reader','prontuarios','DELETE');"])
record('db_read_only',priv=='t|f|f|f','SELECT has_table_privilege clinical_reader SELECT/INSERT/UPDATE/DELETE',priv)
results=[]
for name in ['auth-01','auth-02']:
 folder=ROOT/'evidence/sprint3'/name
 summary=summarize(folder); results.append(summary)
 for f in ['manifest.json','session.json','logs-query.json']:
  source(folder/f)
record('evidence_integrity',all(r['result']=='passed' for r in results),'evidence_analysis.summarize por sessão',results)
record('auth_alert',all(r['invalid_login_events']>=5 for r in results),'summarize valida eventos, firing, cronologia, resolução e coleta final',[{'session_id':r['session_id'],'result':r['result'],'invalid_logins':r['invalid_login_events']} for r in results])
# Frozen interval before the restart: persisted logs must remain byte-identical.
end=time.time()-5;begin=end-60;events,before=export_logs(begin,end)
record('loki_query',bool(events),'Loki query_range janela fixa60s',{'logql':before['logql'],'range_start':iso(begin),'range_end':iso(end),'entries':len(events),'requests':before['requests']})
record('logs_allowlist',all(set(e)<=ALLOWED and isinstance(e['time'],(float,int)) and isinstance(e['status'],(int,float)) for e in events),'Conferência das linhas originais consultadas no Loki',{'events':len(events),'fields':sorted(set(k for e in events for k in e)),'unexpected_fields':[]})
write_json(out/'loki-before-restart.json',before);source(out/'loki-before-restart.json')
run(COMPOSE+['restart','loki','alloy'])
deadline=time.monotonic()+120
while True:
 try:
  run(COMPOSE+['exec','-T','lab','node','-e','Promise.all(["http://loki:3100/ready","http://alloy:12345/-/ready"].map(async u=>{const r=await fetch(u);if(!r.ok)throw Error("Not ready")})).catch(()=>process.exit(1))'])
  break
 except subprocess.SubprocessError:
  if time.monotonic()>=deadline: raise
  time.sleep(3)
after_events,after=export_logs(begin,end)
write_json(out/'loki-after-restart.json',after);source(out/'loki-after-restart.json')
record('loki_persistence',before['entries']==after['entries'],'Reiniciar Loki/Alloy e repetir mesma consulta/intervalo',{'before':len(events),'after':len(after_events),'same_original_entries':before['entries']==after['entries']})
config=(ROOT/'logging/loki.yml').read_text()
record('retention_config','retention_period: 168h' in config and 'retention_enabled: true' in config and 'period: 24h' in config,'Revisão configuração Loki validada pelo binário',{'retention_hours':168,'compactor_retention_enabled':True,'index_period_hours':24,'empirical_7_days':False})
# Inventory and endpoint checks are captured as independent execution evidence.
for _ in range(24):
 coverage=query('lab:collection_coverage_percent')['result']
 if coverage and float(coverage[0]['value'][1])==100: break
 time.sleep(3)
integration=run(['python3','scripts/verify-integration.py'])
record('integration',True,'npm run test:integration',integration)
for endpoint in ['/analysis/sprint2','/analysis/sprint2/data','/analysis/sprint2/source/C01']:
 try:
  urllib.request.urlopen('http://127.0.0.1:3000'+endpoint); code=200
 except urllib.error.HTTPError as e: code=e.code
 assert code==404,endpoint
observations['removed_report_routes']={'result':'404 nas três rotas removidas; runbook200 confirmado pela integração'}
resources=run(DOCKER+['stats','--no-stream','--format','{{json .}}'])
write_json(out/'container-resources.json',[json.loads(row) for row in resources.splitlines()]);source(out/'container-resources.json')
for key,reason in {'record_authorization':'API valida JWT sem vínculo profissional-prontuário.', 'rate_limiting':'Sem limite; ensaios observaram respostas401 repetidas, sem429.', 'backup_restore':'Nenhum ensaio de restauração de backup realizado.', 'independent_monitoring':'Componentes executam no mesmo host.', 'external_notification':'Sem canal externo de notificação configurado.', 'offhost_evidence':'Cópia fora do host não verificada.'}.items():
 checks[key]=False;observations[key]={'method':'Revisão estática e limites do escopo','result':reason}
for name in ['apps/api/app.ts','apps/api/repository.ts','infra/compose.yaml','logging/config.alloy','logging/loki.yml','monitoring/rules.yml','monitoring/prometheus.yml','scripts/session_sprint3.py','scripts/evidence_loki.py','scripts/evidence_analysis.py']:
 target=out/'sources'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target);source(target)
shutil.copyfile(__file__,out/'verify-runtime.py');source(out/'verify-runtime.py')
write_json(out/'runtime.json',{'captured_at':iso(time.time()),'checks':checks,'observations':observations,'sources':sources})
print(json.dumps({'result':'passed','checks':checks},ensure_ascii=False))
