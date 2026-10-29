import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import { Registry, Counter, Histogram, collectDefaultMetrics } from '@prometheus-io/client';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../shared/password.js';
import type { Repository } from './repository.js';
import { registerAnalysis } from './analysis.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; kind: 'clinical' | 'probe' };
    user: { sub: string; kind: 'clinical' | 'probe' };
  }
}
declare module 'fastify' {
  interface FastifyRequest { startedAt: number; trafficKind: string }
}

export async function buildApp(options: { repository: Repository; jwtSecret: string; logger?: FastifyServerOptions['logger'] }) {
  if (options.jwtSecret.length < 32) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres');
  const app = Fastify({ logger: options.logger ?? false, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 4096 });
  const repository = options.repository;
  const identity = { service: 'api', instance_id: randomUUID() };
  const dummyHash = await hashPassword('unused-dummy-password');
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'clinical_' });
  const requests = new Counter({ name: 'clinical_requests_total', help: 'Respostas HTTP por rota, categoria de tráfego e status',
    labelNames: ['route', 'traffic', 'status'], registers: [registry] });
  const duration = new Histogram({ name: 'clinical_request_duration_seconds', help: 'Duração de respostas clínicas bem-sucedidas',
    labelNames: ['route', 'traffic'], buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3], registers: [registry] });
  const authFailures = new Counter({ name: 'clinical_auth_failures_total', help: 'Credenciais ou tokens recusados',
    labelNames: ['stage'], registers: [registry] });
  authFailures.labels('login').inc(0);
  authFailures.labels('token').inc(0);
  for (const traffic of ['clinical', 'probe', 'unauthenticated']) {
    for (const status of ['200', '400', '401', '404', '500', '503']) {
      requests.labels('/prontuarios/:id', traffic, status).inc(0);
    }
  }
  app.decorateRequest('startedAt', 0);
  app.decorateRequest('trafficKind', 'unauthenticated');
  app.addHook('onRequest', async request => { request.startedAt = performance.now(); });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    if (!['/auth/login', '/prontuarios/:id'].includes(route)) return;
    const elapsed = (performance.now() - request.startedAt) / 1000;
    requests.labels(route, request.trafficKind, String(reply.statusCode)).inc();
    if (route === '/prontuarios/:id' && reply.statusCode === 200) {
      duration.labels(route, request.trafficKind).observe(elapsed);
    }
    app.log.info({ ...identity, event: route === '/auth/login' ? 'authentication' : 'record_access',
      correlation_id: request.id, traffic: request.trafficKind, status: reply.statusCode,
      duration_ms: Math.round(elapsed * 1000) }, 'Evento do laboratório');
  });
  app.setErrorHandler((error, request, reply) => {
    const failure = error as { validation?: unknown; statusCode?: number };
    const status = failure.validation ? 400 : failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 503;
    app.log.warn({ ...identity, event: 'request_error', correlation_id: request.id, status }, 'Falha na requisição');
    reply.code(status).send({ error: status === 400 ? 'invalid_request' : status === 503 ? 'service_unavailable' : 'request_rejected' });
  });
  await app.register(jwt, { secret: options.jwtSecret, sign: { expiresIn: '15m', iss: 'healthlab', aud: 'clinical-api' },
    verify: { allowedIss: 'healthlab', allowedAud: 'clinical-api', algorithms: ['HS256'] } });
  await app.register(swagger, { openapi: { info: { title: 'API clínica fictícia', version: '0.1.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } } } });
  app.post<{ Body: { username: string; password: string } }>('/auth/login', {
    schema: { body: { type: 'object', required: ['username', 'password'], additionalProperties: false,
      properties: { username: { type: 'string', minLength: 1, maxLength: 64 }, password: { type: 'string', minLength: 1, maxLength: 256 } } },
    response: { 200: { type: 'object', properties: { access_token: { type: 'string' }, token_type: { type: 'string' }, expires_in: { type: 'integer' } } } } },
  }, async (request, reply) => {
    const professional = await repository.professional(request.body.username);
    const valid = await verifyPassword(request.body.password, professional?.password_hash ?? dummyHash);
    if (!professional || !valid) {
      authFailures.labels('login').inc();
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    request.trafficKind = professional.kind;
    return { access_token: await reply.jwtSign({ sub: String(professional.id), kind: professional.kind }), token_type: 'Bearer', expires_in: 900 };
  });
  app.get<{ Params: { id: number } }>('/prontuarios/:id', {
    schema: { security: [{ bearerAuth: [] }], params: { type: 'object', required: ['id'],
      properties: { id: { type: 'integer', minimum: 1 } } },
      response: { 200: { type: 'object', required: ['id', 'paciente', 'resumo'], properties: {
        id: { type: 'integer' }, paciente: { type: 'string' }, resumo: { type: 'string' } } } } },
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify();
        if (!['clinical', 'probe'].includes(request.user.kind) || !request.user.sub) throw new Error('Invalid principal');
        request.trafficKind = request.user.kind;
      } catch {
        authFailures.labels('token').inc();
        return reply.code(401).send({ error: 'invalid_token' });
      }
    },
  }, async (request, reply) => {
    const record = await repository.record(request.params.id);
    return record ?? reply.code(404).send({ error: 'record_not_found' });
  });
  app.get('/health/live', async () => ({ status: 'alive' }));
  app.get('/health/ready', async () => { await repository.ping(); return { status: 'ready' }; });
  app.get('/metrics', { schema: { hide: true } }, async (_, reply) => reply.type(registry.contentType).send(await registry.metrics()));
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  app.get('/runbook', { schema: { hide: true } }, async (_, reply) => reply.type('text/plain; charset=utf-8').send(await readFile('docs/recuperacao.md', 'utf8')));
  registerAnalysis(app);
  app.addHook('onClose', async () => { registry.clear(); await repository.close(); });
  await app.ready();
  return app;
}
