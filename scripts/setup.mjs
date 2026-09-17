import { randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const secret = () => randomBytes(32).toString('hex');
const hash = password => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const p1 = secret(), p2 = secret(), probe = secret();
const values = {
  POSTGRES_PASSWORD: secret(), APP_DB_PASSWORD: secret(), JWT_SECRET: secret(),
  PROF_1_PASSWORD: p1, PROF_2_PASSWORD: p2, PROBE_PASSWORD: probe,
  PROF_1_HASH: hash(p1), PROF_2_HASH: hash(p2), PROBE_HASH: hash(probe),
  GRAFANA_PASSWORD: secret(),
};
try {
  writeFileSync(new URL('../.env', import.meta.url),
    Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
    { flag: 'wx', mode: 0o600 });
  console.log('.env criado com permissão 0600. Segredos não são exibidos.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error('.env já existe; preservado. Não regenere segredos de volumes existentes.');
  process.exitCode = 1;
}
