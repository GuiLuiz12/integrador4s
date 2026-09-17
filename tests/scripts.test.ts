import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
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
