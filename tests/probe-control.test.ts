import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerProbe } from '../apps/lab/probe-control.js';

test('falha isolada impede somente o scrape; TTL e restauração explícita recuperam', async t => {
  const app = Fastify(); t.after(() => app.close());
  let now = 1000, observations = 0;
  registerProbe(app, async () => { observations++; return { success: 1, duration: 0.01 }; }, () => now);
  app.get('/metrics', async () => 'lab_load_attempts_total 100');
  const control = (seconds: number) => app.inject({ method: 'POST', url: '/control/probe', remoteAddress: '127.0.0.1', payload: { seconds } });
  assert.equal((await control(90)).statusCode, 200);
  assert.equal((await app.inject('/probe')).statusCode, 503);
  assert.equal(observations, 0);
  assert.equal((await app.inject('/metrics')).statusCode, 200);
  now += 90_000;
  assert.match((await app.inject('/probe')).body, /probe_success 1/);
  await control(90);
  await control(0);
  assert.equal((await app.inject('/probe')).statusCode, 200);
});

test('controle recusa acesso remoto e duração inválida', async t => {
  const app = Fastify(); t.after(() => app.close());
  registerProbe(app, async () => ({ success: 0, duration: 0.01 }));
  assert.equal((await app.inject({ method: 'POST', url: '/control/probe', remoteAddress: '172.20.0.2', payload: { seconds: 90 } })).statusCode, 403);
  for (const seconds of [-1, 601, 1.5]) {
    assert.equal((await app.inject({ method: 'POST', url: '/control/probe', remoteAddress: '127.0.0.1', payload: { seconds } })).statusCode, 400);
  }
  const failedClinical = await app.inject('/probe');
  assert.equal(failedClinical.statusCode, 200);
  assert.match(failedClinical.body, /probe_success 0/);
});

test('falha ativada durante probe em curso também invalida o scrape', async t => {
  const app = Fastify(); t.after(() => app.close());
  let finish!: (value: { success: number; duration: number }) => void;
  registerProbe(app, () => new Promise(resolve => { finish = resolve; }));
  await app.ready();
  const pending = app.inject('/probe');
  const request = pending.then(response => response);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await app.inject({ method: 'POST', url: '/control/probe', remoteAddress: '127.0.0.1', payload: { seconds: 90 } });
  finish({ success: 1, duration: 0.01 });
  assert.equal((await request).statusCode, 503);
});
