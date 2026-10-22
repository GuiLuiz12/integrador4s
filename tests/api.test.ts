import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { buildApp } from '../apps/api/app.js';
import { hashPassword } from '../apps/shared/password.js';
import type { Repository } from '../apps/api/repository.js';
import { probe } from '../apps/lab/probe.js';

const password = 'credencial-ficticia-exclusiva-do-teste';
const secret = 'chave-exclusiva-de-teste-sem-uso-no-laboratorio';
async function fixture(logs?: string[]) {
  let unavailable = false;
  const hash = await hashPassword(password);
  const repository: Repository = {
    async professional(username) {
      if (unavailable) throw new Error('database secret must never leak');
      return username === 'profissional1' || username === 'monitor' ? {
        id: username === 'monitor' ? 3 : 1, username, password_hash: hash, kind: username === 'monitor' ? 'probe' : 'clinical' } : undefined;
    },
    async record(id) {
      if (unavailable) throw new Error('database secret must never leak');
      return id === 1 ? { id: 1, paciente: 'Paciente fictício 001', resumo: 'Registro fictício confidencial do teste' } : undefined;
    },
    async ping() { if (unavailable) throw new Error('database secret must never leak'); },
    async close() {},
  };
  const app = await buildApp({ repository, jwtSecret: secret, logger: logs ? {
    stream: new Writable({ write(chunk, _encoding, callback) { logs.push(String(chunk)); callback(); } }) } : false });
  const login = async (username = 'profissional1', pwd = password) => app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: pwd } });
  return { app, login, outage: () => { unavailable = true; }, restore: () => { unavailable = false; } };
}
test('login, consulta e política de somente leitura', async t => {
  const { app, login } = await fixture(); t.after(() => app.close());
  const response = await login(); assert.equal(response.statusCode, 200);
  const body = response.json(); assert.equal(body.expires_in, 900);
  const headers = { authorization: `Bearer ${body.access_token}` };
  const record = await app.inject({ url: '/prontuarios/1', headers });
  assert.equal(record.statusCode, 200); assert.equal(record.json().id, 1);
  assert.equal((await app.inject({ method: 'POST', url: '/prontuarios/1', headers, payload: {} })).statusCode, 404);
  assert.equal((await app.inject({ url: '/prontuarios/999', headers })).statusCode, 404);
});
test('credenciais inválidas, desconhecidas, ausentes e token expirado são recusados', async t => {
  const { app, login } = await fixture(); t.after(() => app.close());
  assert.equal((await login('profissional1', 'errada')).statusCode, 401);
  assert.equal((await login('desconhecido')).statusCode, 401);
  assert.equal((await app.inject('/prontuarios/1')).statusCode, 401);
  const expired = app.jwt.sign({ sub: '1', kind: 'clinical' }, { expiresIn: -1 });
  assert.equal((await app.inject({ url: '/prontuarios/1', headers: { authorization: `Bearer ${expired}` } })).statusCode, 401);
  assert.equal((await app.inject({ url: '/prontuarios/1', headers: { authorization: 'Bearer forged' } })).statusCode, 401);
});
test('validação limita os dados de entrada', async t => {
  const { app, login } = await fixture(); t.after(() => app.close());
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'x' } })).statusCode, 400);
  const token = (await login()).json().access_token;
  assert.equal((await app.inject({ url: '/prontuarios/abc', headers: { authorization: `Bearer ${token}` } })).statusCode, 400);
});
test('queda do banco preserva vitalidade, retorna 503 e recupera', async t => {
  const { app, login, outage, restore } = await fixture(); t.after(() => app.close());
  const token = (await login()).json().access_token;
  outage();
  assert.equal((await app.inject('/health/live')).statusCode, 200);
  assert.equal((await app.inject('/health/ready')).statusCode, 503);
  assert.equal((await login()).statusCode, 503);
  const failed = await app.inject({ url: '/prontuarios/1', headers: { authorization: `Bearer ${token}` } });
  assert.equal(failed.statusCode, 503); assert.deepEqual(failed.json(), { error: 'service_unavailable' });
  restore(); assert.equal((await app.inject('/health/ready')).statusCode, 200);
});
test('telemetria separa consultas clínicas e probes; logs omitem credenciais e conteúdo', async t => {
  const logs: string[] = [];
  const { app, login, outage } = await fixture(logs); t.after(() => app.close());
  const clinicalToken = (await login()).json().access_token;
  const probeToken = (await login('monitor')).json().access_token;
  for (const token of [clinicalToken, probeToken]) await app.inject({ url: '/prontuarios/1', headers: { authorization: `Bearer ${token}` } });
  await login('profissional1', 'errada'); outage(); await login();
  const metrics = (await app.inject('/metrics')).body;
  assert.match(metrics, /clinical_requests_total\{route="\/prontuarios\/:id",traffic="clinical",status="200"\} 1/);
  assert.match(metrics, /clinical_requests_total\{route="\/prontuarios\/:id",traffic="probe",status="200"\} 1/);
  assert.match(metrics, /clinical_auth_failures_total\{stage="login"\} 1/);
  for (const forbidden of [password, clinicalToken, probeToken, 'Paciente fictício', 'confidencial', 'database secret']) {
    assert.ok(!logs.join('').includes(forbidden), `Log contém dado omitido: ${forbidden.slice(0, 10)}`);
  }
  assert.ok(logs.some(line => line.includes('record_access')));
});
test('OpenAPI documenta autenticação e consulta', async t => {
  const { app } = await fixture(); t.after(() => app.close());
  const spec = (await app.inject('/openapi.json')).json();
  assert.ok(spec.paths['/auth/login'].post);
  assert.deepEqual(spec.paths['/prontuarios/{id}'].get.security, [{ bearerAuth: [] }]);
});
test('verificação real HTTP percorre login, consulta e detecta a dependência indisponível', async t => {
  const { app, outage } = await fixture(); t.after(() => app.close());
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  assert.equal((await probe(base, { username: 'monitor', password })).success, 1);
  outage(); assert.equal((await probe(base, { username: 'monitor', password })).success, 0);
});

test('logs correlacionam diagnóstico e resposta e distinguem instâncias reiniciadas', async t => {
  const firstLogs: string[] = [], secondLogs: string[] = [];
  const first = await fixture(firstLogs), second = await fixture(secondLogs);
  t.after(async () => { await first.app.close(); await second.app.close(); });
  await first.login();
  first.outage();
  await first.login();
  await second.login();
  const parse = (logs: string[]) => logs.join('').trim().split('\n').map(line => JSON.parse(line));
  const firstEvents = parse(firstLogs).filter(event => event.event);
  const secondEvent = parse(secondLogs).find(event => event.event === 'authentication');
  assert.ok(firstEvents.every(event => event.service === 'api' && event.instance_id === firstEvents[0].instance_id));
  assert.notEqual(firstEvents[0].instance_id, secondEvent.instance_id);
  assert.equal(firstEvents[0].correlation_id, secondEvent.correlation_id);
  const error = firstEvents.find(event => event.event === 'request_error');
  const response = firstEvents.find(event => event.event === 'authentication' && event.status === 503);
  assert.ok(error && response);
  assert.equal(error.correlation_id, response.correlation_id);
});
