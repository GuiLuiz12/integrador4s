import type { FastifyInstance } from 'fastify';

/** A failed scrape is deliberately distinct from a failed clinical request. */
export function registerProbe(app: FastifyInstance,
  observe: () => Promise<{ success: number; duration: number }>, now = Date.now) {
  let unavailableUntil = 0;
  let inFlight: ReturnType<typeof observe> | undefined;
  app.post<{ Body: { seconds: number } }>('/control/probe', {
    schema: { body: { type: 'object', required: ['seconds'], additionalProperties: false,
      properties: { seconds: { type: 'integer', minimum: 0, maximum: 600 } } } },
    onRequest: async (request, reply) => {
      if (request.ip !== '127.0.0.1') return reply.code(403).send({ error: 'local_control_only' });
    },
  }, async request => {
    unavailableUntil = request.body.seconds ? now() + request.body.seconds * 1000 : 0;
    app.log.info({ event: 'probe_collection_change', seconds: request.body.seconds });
    return { seconds: request.body.seconds };
  });
  app.get('/probe', async (_, reply) => {
    if (now() < unavailableUntil) return reply.code(503).send({ error: 'simulated_collection_failure' });
    inFlight ??= observe().finally(() => { inFlight = undefined; });
    const result = await inFlight;
    if (now() < unavailableUntil) return reply.code(503).send({ error: 'simulated_collection_failure' });
    return reply.type('text/plain; version=0.0.4').send(
      '# HELP probe_success Fluxo autenticado e prontuário esperado disponíveis\n# TYPE probe_success gauge\n' +
      `probe_success ${result.success}\n` +
      '# HELP probe_duration_seconds Duração total do fluxo assistencial\n# TYPE probe_duration_seconds gauge\n' +
      `probe_duration_seconds ${result.duration}\n`);
  });
}
