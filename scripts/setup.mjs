import { randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync, readFileSync, lstatSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const secret = () => randomBytes(32).toString('hex');
const hash = password => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const required = ['POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'JWT_SECRET', 'PROF_1_PASSWORD',
  'PROF_2_PASSWORD', 'PROBE_PASSWORD', 'PROF_1_HASH', 'PROF_2_HASH', 'PROBE_HASH', 'GRAFANA_PASSWORD'];

export function prepareEnvironment(file = new URL('../.env', import.meta.url)) {
  let existing;
  try { existing = lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('.env deve ser um arquivo regular, sem link simbólico.');
    const values = Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }));
    const invalid = required.filter(key => !values[key] || values[key] === 'GENERATED' ||
      (key.endsWith('_HASH') && !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(values[key])));
    if (invalid.length) throw new Error(`.env incompleto ou inválido: ${invalid.join(', ')}. Restaure a configuração; segredos existentes não foram alterados.`);
    chmodSync(file, 0o600);
    return false;
  }
  const p1 = secret(), p2 = secret(), probe = secret();
  const values = {
    POSTGRES_PASSWORD: secret(), APP_DB_PASSWORD: secret(), JWT_SECRET: secret(),
    PROF_1_PASSWORD: p1, PROF_2_PASSWORD: p2, PROBE_PASSWORD: probe,
    PROF_1_HASH: hash(p1), PROF_2_HASH: hash(p2), PROBE_HASH: hash(probe),
    GRAFANA_PASSWORD: secret(),
  };
  writeFileSync(file,
    Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
    { flag: 'wx', mode: 0o600 });
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(prepareEnvironment() ? '.env criado com permissão 0600. Segredos não são exibidos.' : '.env válido preservado; permissão 0600. Nenhuma senha foi regenerada.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
