import Fastify, { LogController } from 'fastify';
import { Registry, Gauge, Counter, collectDefaultMetrics } from '@prometheus-io/client';
import { required } from '../shared/config.js';
import { login, probe } from './probe.js';
import { registerProbe } from './probe-control.js';

const app = Fastify({ logger: true, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 1024 });
const base = 'http://api:3000';
const probeCredentials = { username: 'monitor', password: required('PROBE_PASSWORD') };
const clinicalCredentials = { username: 'profissional1', password: required('PROF_1_PASSWORD') };
const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'lab_' });
const rateMetric = new Gauge({ name: 'lab_load_rate', help: 'Consultas agendadas por segundo', registers: [registry] });
const attempts = new Counter({ name: 'lab_load_attempts_total', help: 'Tentativas de tráfego e resultado de transporte',
  labelNames: ['result'], registers: [registry] });
for (const result of ['success', 'http_error', 'transport_or_login_error', 'concurrency_limit']) attempts.labels(result).inc(0);
let rate = 1, until = 0, active = 0, token = '', tokenUntil = 0, recordId = 0;
let timer: NodeJS.Timeout;
let stopped = false;
let loginInFlight: Promise<string> | undefined;
async function accessToken(): Promise<string> {
  if (token && Date.now() < tokenUntil) return token;
  loginInFlight ??= login(base, clinicalCredentials, AbortSignal.timeout(3000)).then(value => {
    token = value; tokenUntil = Date.now() + 840_000; return value;
  }).finally(() => { loginInFlight = undefined; });
  return loginInFlight;
}
async function requestRecord() {
  active++;
  try {
    const currentToken = await accessToken();
    recordId = recordId % 100 + 1;
    const response = await fetch(`${base}/prontuarios/${recordId}`, {
      headers: { authorization: `Bearer ${currentToken}` }, signal: AbortSignal.timeout(3000) });
    await response.arrayBuffer();
    attempts.labels(response.ok ? 'success' : 'http_error').inc();
    if (response.status === 401) tokenUntil = 0;
  } catch { attempts.labels('transport_or_login_error').inc(); }
  finally { active--; }
}
function tick() {
  if (stopped) return;
  if (until && Date.now() >= until) { rate = 1; until = 0; }
  rateMetric.set(rate);
  if (rate > 0) {
    if (active < 5) void requestRecord();
    else attempts.labels('concurrency_limit').inc();
  }
  timer = setTimeout(tick, rate > 0 ? 1000 / rate : 1000);
}
registerProbe(app, () => probe(base, probeCredentials));
app.get('/metrics', async (_, reply) => reply.type(registry.contentType).send(await registry.metrics()));
app.get('/health/live', async () => ({ status: 'alive' }));
app.post<{ Body: { rate: number; seconds: number } }>('/control/load', {
  schema: { body: { type: 'object', required: ['rate', 'seconds'], additionalProperties: false,
    properties: { rate: { type: 'integer', minimum: 0, maximum: 5 }, seconds: { type: 'integer', minimum: 1, maximum: 7200 } } } },
  onRequest: async (request, reply) => {
    if (request.ip !== '127.0.0.1') return reply.code(403).send({ error: 'local_control_only' });
  },
}, async request => {
  rate = request.body.rate; until = Date.now() + request.body.seconds * 1000;
  rateMetric.set(rate);
  app.log.info({ event: 'load_change', rate, seconds: request.body.seconds });
  return { rate, seconds: request.body.seconds };
});
app.addHook('onClose', async () => { stopped = true; clearTimeout(timer); registry.clear(); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void app.close(); });
await app.listen({ host: '0.0.0.0', port: 9091 });
tick();
