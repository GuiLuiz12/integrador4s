import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, stat, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// Environment generation only needs Node's standard library; no npm ci in setup.
// @ts-expect-error JavaScript operational script, outside the application compilation.
import { prepareEnvironment } from '../scripts/setup.mjs';

function shell(body: string) {
  return spawnSync('bash', ['-c', 'set -euo pipefail\nsource scripts/setup-host.sh\n' + body], { encoding: 'utf8' });
}
const healthyCommands = `
SETUP_CHECK_ONLY=0
docker() { if [[ "$*" == 'compose up --help' ]]; then printf '%s\\n' '--wait-timeout'; fi; }
dockerd() { :; }
python3() { :; }
curl() { :; }
setup_package_installed() { [[ "$1" == ca-certificates ]]; }
setup_admin() { echo 'UNEXPECTED_SYSTEM_MUTATION'; return 99; }
`;

test('setup aceita Ubuntu 24.04 e >=26 e recusa sistemas fora do escopo antes de instalar', () => {
  for (const [id, version, supported] of [['ubuntu', '24.04', true], ['ubuntu', '26.04', true], ['ubuntu', '26.10', true], ['ubuntu', '28.04', true], ['ubuntu', '22.04', false], ['ubuntu', '25.10', false], ['debian', '26.04', false]] as const) {
    const result = shell(`setup_read_os() { ID=${id}; VERSION_ID=${version}; UBUNTU_CODENAME=fixture; }\nuname() { echo x86_64; }\nstat() { echo cgroup2fs; }\nsetup_platform`);
    assert.equal(result.status, supported ? 0 : 1, `${id} ${version}: ${result.stderr}`);
  }
});

test('host pronto não instala pacotes; --check acusa ausências sem instalar', () => {
  const ready = shell(healthyCommands + '\nsetup_dependencies');
  assert.equal(ready.status, 0, ready.stderr);
  assert.ok(!ready.stdout.includes('UNEXPECTED_SYSTEM_MUTATION'));
  const missing = shell(healthyCommands + '\nSETUP_CHECK_ONLY=1\ndocker() { return 1; }\nsetup_dependencies');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Requisitos ausentes:.*docker-compose-plugin.*docker-buildx-plugin/);
  assert.ok(!missing.stdout.includes('UNEXPECTED_SYSTEM_MUTATION'));
});

test('instala somente plugins ausentes, com APT sem remoção de pacotes', () => {
  const result = shell(healthyCommands + `
COMPOSE_REPAIRED=0
docker() { if (( COMPOSE_REPAIRED )); then [[ "$*" != 'compose up --help' ]] || echo --wait-timeout; return 0; fi; return 1; }
setup_docker_repository() { echo REPOSITORY_CHECKED; }
setup_admin() { printf 'ADMIN %s\\n' "$*"; COMPOSE_REPAIRED=1; }
setup_dependencies
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REPOSITORY_CHECKED/);
  assert.match(result.stdout, /apt-get install --yes --no-remove docker-compose-plugin docker-buildx-plugin/);
  assert.ok(!result.stdout.includes('docker-ce'));
});

test('Compose instalado mas antigo é atualizado sem reinstalar o engine', () => {
  const result = shell(healthyCommands + `
COMPOSE_REPAIRED=0
docker() { if [[ "$*" == 'compose up --help' ]]; then (( COMPOSE_REPAIRED )) && echo --wait-timeout || echo --help; fi; }
setup_docker_repository() { :; }
setup_admin() { printf 'ADMIN %s\\n' "$*"; COMPOSE_REPAIRED=1; }
setup_dependencies
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /apt-get install --yes --no-remove docker-compose-plugin/);
  assert.ok(!result.stdout.includes('docker-ce'));
});

test('host sem Docker nem Python instala todos os requisitos usando o repositório oficial', () => {
  const result = shell(healthyCommands + `
command() {
  if [[ "$1" == -v && ( "$2" == docker || "$2" == dockerd || "$2" == python3 ) ]]; then return 1; fi
  builtin command "$@"
}
setup_docker_repository() { echo REPOSITORY_CHECKED; }
setup_admin() { printf 'ADMIN %s\\n' "$*"; }
setup_dependencies
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /apt-get install --yes --no-remove python3/);
  assert.match(result.stdout, /REPOSITORY_CHECKED/);
  assert.match(result.stdout, /apt-get install --yes --no-remove docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin/);
});

test('recursos insuficientes impedem instalação e Docker remoto é recusado', () => {
  const resources = shell('LAB_ROOT=.\ngetconf() { echo 2; }\nsetup_resources');
  assert.equal(resources.status, 1);
  assert.match(resources.stderr, /São necessárias 6 CPUs/);
  const remote = shell('DOCKER_CONTEXT=fixture\ndocker() { echo ssh://outro-host; }\nsetup_admin() { echo UNEXPECTED_SYSTEM_MUTATION; }\nsetup_daemon');
  assert.equal(remote.status, 1);
  assert.match(remote.stderr, /Docker remoto/);
  assert.ok(!remote.stdout.includes('UNEXPECTED_SYSTEM_MUTATION'));
});

test('instalação parcial conflitante e versão sem repositório não alteram o sistema', () => {
  const conflict = shell(healthyCommands + `
docker() { return 1; }
setup_package_installed() { [[ "$1" == ca-certificates || "$1" == docker.io ]]; }
setup_dependencies
`);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /pacotes conflitantes: docker.io/);
  assert.ok(!conflict.stdout.includes('UNEXPECTED_SYSTEM_MUTATION'));
  const unsupportedRepo = shell(`VERSION_ID=28.04; UBUNTU_CODENAME=future\ncurl() { return 22; }\nsetup_admin() { echo UNEXPECTED_SYSTEM_MUTATION; }\nsetup_docker_repository`);
  assert.equal(unsupportedRepo.status, 1);
  assert.match(unsupportedRepo.stderr, /Docker ainda não oferece o repositório/);
  assert.ok(!unsupportedRepo.stdout.includes('UNEXPECTED_SYSTEM_MUTATION'));
});

test('setup cria configuração uma vez e preserva conteúdo, hashes e senhas em repetições', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'healthlab-setup-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = join(folder, '.env');
  assert.equal(prepareEnvironment(file), true);
  const original = await readFile(file, 'utf8');
  assert.equal(original.trim().split('\n').length, 10);
  await chmod(file, 0o644);
  assert.equal(prepareEnvironment(file), false);
  assert.equal(await readFile(file, 'utf8'), original);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const invalid = join(folder, 'invalid.env');
  await writeFile(invalid, 'GRAFANA_PASSWORD=GENERATED\n');
  assert.throws(() => prepareEnvironment(invalid), /incompleto ou inválido/);
  assert.equal(await readFile(invalid, 'utf8'), 'GRAFANA_PASSWORD=GENERATED\n');
  const link = join(folder, 'linked.env');
  await symlink(file, link);
  assert.throws(() => prepareEnvironment(link), /sem link simbólico/);
});

test('sem .env e com volumes antigos, setup bloqueia criação de senhas incompatíveis', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'healthlab-volumes-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, 'scripts'));
  const log = join(folder, 'commands.log');
  await writeFile(join(folder, 'scripts/docker.sh'), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$SETUP_TEST_LOG"\nif [[ "$1 $2" == "volume ls" ]]; then echo governanca-saude_postgres_data; fi\n', { mode: 0o755 });
  const result = spawnSync('bash', ['-c', 'set -euo pipefail\nsource scripts/setup-host.sh\nLAB_ROOT="$SETUP_TEST_ROOT"\nsetup_environment'], {
    encoding: 'utf8', env: { ...process.env, SETUP_TEST_ROOT: folder, SETUP_TEST_LOG: log },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Restaure o .env original/);
  assert.ok(!(await readFile(log, 'utf8')).includes('run --rm'));
});

test('modo --check não cria configuração nem sobe serviços', () => {
  const result = shell(`LAB_ROOT=${JSON.stringify(resolve('.'))}\nsetup_platform() { :; }\nsetup_resources() { :; }\nsetup_dependencies() { :; }\nsetup_daemon() { :; }\nsetup_environment() { echo UNEXPECTED_ENV; return 99; }\nsetup_start() { echo UNEXPECTED_START; return 99; }\nsetup_main --check`);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('UNEXPECTED_'));
});

test('setup normal prepara configuração sem iniciar contêineres', () => {
  const result = shell(`LAB_ROOT=${JSON.stringify(resolve('.'))}
setup_platform() { :; }
setup_resources() { :; }
setup_dependencies() { :; }
setup_daemon() { :; }
setup_environment() { echo ENV_PREPARED; }
setup_start() { echo UNEXPECTED_START; return 99; }
setup_main
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ENV_PREPARED/);
  assert.match(result.stdout, /Nenhum contêiner foi iniciado/);
  assert.ok(!result.stdout.includes('UNEXPECTED_START'));
});
