import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function shell(body: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bash', ['-c', 'set -euo pipefail\nsource scripts/bootstrap-host.sh\n' + body], {
    encoding: 'utf8', env: { ...process.env, ...env },
  });
}

test('bootstrap aceita as plataformas previstas e seleciona checksum por arquitetura', () => {
  for (const version of ['24.04', '26.04', '26.10', '28.04']) {
    for (const arch of ['x86_64', 'aarch64']) {
      const result = shell(`bootstrap_read_os() { ID=ubuntu; VERSION_ID=${version}; }\nuname() { echo ${arch}; }\nbootstrap_platform\nprintf '%s %s' "$BOOTSTRAP_ARCH" "$BOOTSTRAP_SHA"`);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, arch === 'x86_64' ? /^x64 [a-f0-9]{64}$/ : /^arm64 [a-f0-9]{64}$/);
    }
  }
  for (const platform of ['ID=ubuntu; VERSION_ID=22.04', 'ID=ubuntu; VERSION_ID=25.10', 'ID=debian; VERSION_ID=26.04']) {
    assert.equal(shell(`bootstrap_read_os() { ${platform}; }\nbootstrap_platform`).status, 1);
  }
});

test('Node/npm compatíveis não acionam instalação nem sudo', () => {
  const result = shell(`
bootstrap_platform() { :; }
node() { [[ "$1" != --version ]] || echo v22.13.1; }
npm() { echo 11.13.0; }
bootstrap_paths() { echo UNEXPECTED_MUTATION; return 99; }
bootstrap_dependencies() { echo UNEXPECTED_MUTATION; return 99; }
bootstrap_install_runtime() { echo UNEXPECTED_MUTATION; return 99; }
bootstrap_main
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /instalação preservada/);
  assert.ok(!result.stdout.includes('UNEXPECTED_MUTATION'));
});

test('Node antigo, npm quebrado ou npm ausente exigem reparação', () => {
  assert.equal(shell('node() { return 1; }\nnpm() { :; }\nbootstrap_runtime_ready').status, 1);
  assert.equal(shell('node() { :; }\nnpm() { return 1; }\nbootstrap_runtime_ready').status, 1);
  assert.equal(shell('command() { [[ "$*" != "-v npm" ]] && builtin command "$@"; }\nbootstrap_runtime_ready').status, 1);
});

test('conflitos de PATH e arquivos de outro gerenciador não são sobrescritos', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'healthlab-bootstrap-path-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const bin = join(folder, 'bin');
  const other = join(folder, 'other');
  await mkdir(bin); await mkdir(other);
  await writeFile(join(bin, 'node'), 'installation to preserve', { mode: 0o755 });
  const env = { BOOTSTRAP_BIN: bin, BOOTSTRAP_PREFIX: join(folder, 'prefix'), PATH: `${bin}:/usr/bin:/bin` };
  const conflict = shell('bootstrap_paths', env);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /não pertence ao laboratório/);
  assert.equal(await readFile(join(bin, 'node'), 'utf8'), 'installation to preserve');
  await rm(join(bin, 'node'));
  await writeFile(join(other, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const shadow = shell('bootstrap_paths', { ...env, PATH: `${other}:${bin}:/usr/bin:/bin` });
  assert.equal(shadow.status, 1);
  assert.match(shadow.stderr, /precede .* no PATH/);
  await symlink(`${env.BOOTSTRAP_PREFIX}/node-v22.23.2-linux-x64/bin/node`, join(bin, 'node'));
  assert.equal(shell('bootstrap_paths', env).status, 0, 'Atalhos do próprio projeto podem ser reparados');
});

test('download falho e checksum divergente impedem extração ou instalação', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'healthlab-bootstrap-integrity-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const base = `
BOOTSTRAP_PREFIX="$BOOTSTRAP_TEST_ROOT/prefix"
BOOTSTRAP_BIN="$BOOTSTRAP_TEST_ROOT/bin"
BOOTSTRAP_VERSION=22.23.2
BOOTSTRAP_ARCH=x64
BOOTSTRAP_NAME=node-v22.23.2-linux-x64
BOOTSTRAP_SHA=${'0'.repeat(64)}
bootstrap_admin() { echo UNEXPECTED_INSTALLATION; return 99; }
`;
  const env = { BOOTSTRAP_TEST_ROOT: folder };
  const failed = shell(base + '\ncurl() { return 22; }\nbootstrap_install_runtime', env);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Download falhou/);
  assert.ok(!failed.stdout.includes('UNEXPECTED_INSTALLATION'));
  const corrupt = shell(base + '\ncurl() { printf corrupt > "${@: -1}"; }\nbootstrap_install_runtime', env);
  assert.equal(corrupt.status, 1);
  assert.match(corrupt.stderr, /SHA-256 divergente/);
  assert.ok(!corrupt.stdout.includes('UNEXPECTED_INSTALLATION'));
});
