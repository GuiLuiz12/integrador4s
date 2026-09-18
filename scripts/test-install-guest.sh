#!/usr/bin/env bash
# Used only inside the disposable VM by npm run test:ubuntu26.
set -euo pipefail
[[ "$(hostname)" == healthlab-ubuntu26 ]] || { echo 'Este roteiro deve rodar somente na VM descartável de teste.' >&2; exit 1; }
[[ ! -e .env ]] || { echo 'O teste exige checkout sem .env.' >&2; exit 1; }
for executable in node npm docker; do
  if command -v "$executable" >/dev/null; then echo "A imagem inicial já contém $executable; não é uma instalação limpa." >&2; exit 1; fi
done
cat /etc/os-release
uname -r
./bootstrap.sh
npm run setup
[[ -z "$(sudo docker ps -aq)" ]] || { echo 'Setup não deveria criar contêineres.' >&2; exit 1; }
npm run setup:check
npm start
npm run config:check
npm run test:rules
npm run test:integration
npm run health
npm run db -- -c 'SELECT count(*) FROM prontuarios;'
mkdir -p evidence/runs/install-test
python3 - <<'PY'
import hashlib,json,pathlib,subprocess,sys
sys.path.insert(0,'scripts')
from evidence import COMPOSE
record_hash=subprocess.check_output(COMPOSE+['exec','-T','postgres','psql','-U','lab_owner','-d','healthlab','-Atc',"SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY id)) FROM prontuarios t"],text=True).strip()
pathlib.Path('evidence/runs/install-test/before.json').write_text(json.dumps({'env':hashlib.sha256(pathlib.Path('.env').read_bytes()).hexdigest(),'records':record_hash}))
PY
npm stop
npm run setup
[[ -z "$(sudo docker ps -aq)" ]] || { echo 'Setup não deveria subir contêineres.' >&2; exit 1; }
npm start
npm run test:integration
python3 - <<'PY'
import hashlib,json,pathlib,subprocess,sys,os
sys.path.insert(0,'scripts')
from evidence import COMPOSE,query
folder=pathlib.Path('evidence/runs/install-test')
before=json.loads((folder/'before.json').read_text())
assert hashlib.sha256(pathlib.Path('.env').read_bytes()).hexdigest()==before['env']
record_hash=subprocess.check_output(COMPOSE+['exec','-T','postgres','psql','-U','lab_owner','-d','healthlab','-Atc',"SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY id)) FROM prontuarios t"],text=True).strip()
assert record_hash==before['records']
def version(args): return subprocess.check_output(args,text=True).strip()
result={'result':'passed','os':dict(line.split('=',1) for line in pathlib.Path('/etc/os-release').read_text().splitlines() if '=' in line)['PRETTY_NAME'].strip('"'),
        'kernel':version(['uname','-r']),'node':version(['node','--version']),'npm':version(['npm','--version']),
        'docker':version(['sudo','docker','version','--format','{{.Server.Version}}']),
        'compose':version(['docker','compose','version','--short']),
        'cgroups':version(['stat','-fc','%T','/sys/fs/cgroup']),
        'initial_node_npm_docker_absent':True,'operator_in_docker_group': 'docker' in version(['id','-nG']).split(),
        'setup_without_containers':True,'integration_passed':True,'rules_passed':True,
        'targets':len(query('up')['result']),'coverage_percent':float(query('lab:collection_coverage_percent')['result'][0]['value'][1]),
        'env_preserved':True,'records_preserved':True,'records':100,
        'env_permissions':oct(pathlib.Path('.env').stat().st_mode & 0o777)}
(folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
PY
