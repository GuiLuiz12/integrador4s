import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('SIGTERM interrompe a espera e solicita restauração do serviço', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'healthlab-signal-'));
  const log = join(directory, 'commands.log');
  // A command-boundary double: this test never contacts Docker or stops a real service.
  await writeFile(join(directory, 'docker'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$TEST_DOCKER_LOG"\n', { mode: 0o700 });
  const child = spawn('bash', [resolve('scripts/lab.sh'), 'fail-db', '5'], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_DOCKER_LOG: log }, stdio: 'ignore',
  });
  const exited = new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code));
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  });
  let commands = '';
  for (let i = 0; i < 100; i++) {
    commands = await readFile(log, 'utf8').catch(() => '');
    if (commands.includes('stop -t 5 postgres')) break;
    await delay(20);
  }
  assert.match(commands, /stop -t 5 postgres/);
  await delay(100); // Let the shell enter its interruptible background wait.
  const sentAt = performance.now();
  child.kill('SIGTERM');
  assert.equal(await exited, 143);
  assert.ok(performance.now() - sentAt < 1500, 'Restauração não deve esperar os cinco segundos do experimento');
  assert.match(await readFile(log, 'utf8'), /start postgres/);
});

test('comandos npm preservam argumentos e códigos de saída sem contatar Docker real', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'healthlab-npm-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const log = join(directory, 'commands.jsonl');
  await writeFile(join(directory, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_DOCKER_LOG, JSON.stringify(args) + '\\n');
if (args[0] !== 'info') process.exit(Number(process.env.TEST_DOCKER_EXIT || 0));
`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_DOCKER_LOG: log };
  const expr = 'sum by(job) (up{job="api"})';
  const query = spawnSync('npm', ['run', '--silent', 'metrics:query', '--', expr], { encoding: 'utf8', env });
  assert.equal(query.status, 0, query.stderr);
  const commands = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
  assert.deepEqual(commands.at(-1)?.slice(-2), ['query', expr]);
  const failed = spawnSync('npm', ['run', '--silent', 'check'], { encoding: 'utf8', env: { ...env, TEST_DOCKER_EXIT: '42' } });
  assert.equal(failed.status, 42, failed.stderr);
  await writeFile(log, '');
  assert.equal(spawnSync('npm', ['stop', '--silent'], { encoding: 'utf8', env }).status, 0);
  const stop = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
  assert.equal(stop.at(-1)?.at(-1), 'down');
  assert.ok(stop.every(args => !args.includes('-v') && !args.includes('--volumes')));
  await writeFile(log, '');
  assert.equal(spawnSync('npm', ['stop', '--silent', '--', '-v'], { encoding: 'utf8', env }).status, 2);
  assert.equal(await readFile(log, 'utf8'), '');
  assert.equal(spawnSync('npm', ['run', '--silent', 'logs', '--', '--env-file'], { encoding: 'utf8', env }).status, 2);
  assert.equal(await readFile(log, 'utf8'), '');
});

test('preparação visual instala bibliotecas somente quando faltam e propaga falha de sudo', async t => {
  const root = await mkdtemp(join(tmpdir(), 'healthlab-browser-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'bin'));
  await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
  await writeFile(join(root, 'scripts/browser.sh'), await readFile('scripts/browser.sh'));
  await writeFile(join(root, 'node_modules/.bin/playwright'), `#!/bin/bash
echo "$*" >> "$TEST_BROWSER_ROOT/commands"
if [[ "$1" == install-deps ]]; then
  [[ "$TEST_BROWSER_MODE" != sudo-failure ]] || exit 1
  touch "$TEST_BROWSER_ROOT/repaired"
fi
`, { mode: 0o755 });
  await writeFile(join(root, 'bin/node'), `#!/bin/bash
if [[ "$TEST_BROWSER_MODE" == unrelated ]]; then echo 'Sandbox launch error' >&2; exit 1; fi
if [[ "$TEST_BROWSER_MODE" != ready && ! -e "$TEST_BROWSER_ROOT/repaired" ]]; then
  echo 'Host system is missing dependencies' >&2; exit 1
fi
`, { mode: 0o755 });
  for (const mode of ['ready', 'missing', 'sudo-failure', 'unrelated']) {
    await writeFile(join(root, 'commands'), '');
    await rm(join(root, 'repaired'), { force: true });
    const result = spawnSync('bash', [join(root, 'scripts/browser.sh'), 'setup'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, TEST_BROWSER_ROOT: root, TEST_BROWSER_MODE: mode },
    });
    assert.equal(result.status, ['ready', 'missing'].includes(mode) ? 0 : 1, `${mode}: ${result.stderr}`);
    const commands = await readFile(join(root, 'commands'), 'utf8');
    assert.equal(commands.includes('install-deps'), ['missing', 'sudo-failure'].includes(mode));
    if (mode === 'sudo-failure') assert.match(result.stderr, /terminal com acesso sudo/);
  }
});

test('start não informa sucesso sem preparação ou sem cobertura de monitoramento', async t => {
  const root = await mkdtemp(join(tmpdir(), 'healthlab-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'scripts/start.sh'), await readFile('scripts/start.sh'));
  await writeFile(join(root, 'scripts/lab.sh'), '#!/bin/bash\nexit 0\n');
  for (const tool of ['docker', 'curl', 'sleep']) {
    await writeFile(join(root, 'bin', tool), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  }
  await writeFile(join(root, 'bin/python3'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${root}/bin:${process.env.PATH}` };
  const missing = spawnSync('bash', [join(root, 'scripts/start.sh')], { encoding: 'utf8', env });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Execute npm run setup/);
  await writeFile(join(root, '.env'), 'TEST_ONLY=true\n');
  const noCoverage = spawnSync('bash', [join(root, 'scripts/start.sh')], { encoding: 'utf8', env });
  assert.equal(noCoverage.status, 1);
  assert.match(noCoverage.stderr, /A coleta não chegou a 100%/);
  assert.ok(!noCoverage.stdout.includes('[start] Pronto:'));
  // All scrape endpoints can respond while cAdvisor exposes no per-service data.
  await writeFile(join(root, 'scripts/lab.sh'), '#!/bin/bash\nif [[ "${2:-}" == lab:collection_coverage_percent ]]; then echo coverage-only; else echo no-container-metrics; fi\n');
  await writeFile(join(root, 'bin/python3'), '#!/bin/bash\nread -r value\n[[ "$value" == coverage-only ]]\n', { mode: 0o755 });
  const noContainers = spawnSync('bash', [join(root, 'scripts/start.sh')], { encoding: 'utf8', env });
  assert.equal(noContainers.status, 1);
  assert.match(noContainers.stderr, /faltam métricas dos contêineres/);
  assert.ok(!noContainers.stdout.includes('[start] Pronto:'));
});

test('SIGTERM restaura o probe isolado sem esperar o TTL e sem parar serviços', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'healthlab-probe-signal-'));
  const log = join(directory, 'commands.log');
  await writeFile(join(directory, 'docker'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$TEST_DOCKER_LOG"\n', { mode: 0o700 });
  const child = spawn('bash', [resolve('scripts/lab.sh'), 'fail-probe', '5'], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_DOCKER_LOG: log }, stdio: 'ignore',
  });
  const exited = new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  });
  let commands = '';
  for (let i = 0; i < 100; i++) {
    commands = await readFile(log, 'utf8').catch(() => '');
    if (commands.includes('probe-control 5')) break;
    await delay(20);
  }
  assert.match(commands, /probe-control 5/);
  await delay(100);
  const sentAt = performance.now();
  child.kill('SIGTERM');
  await exited;
  assert.ok(performance.now() - sentAt < 1500);
  const restored = await readFile(log, 'utf8');
  assert.match(restored, /probe-control 0/);
  assert.ok(!restored.includes('stop ') && !restored.includes('start '));
});
