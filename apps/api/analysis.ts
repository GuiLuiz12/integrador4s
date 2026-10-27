import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Read-only, generated report assets. No arbitrary filesystem paths are accepted. */
export function registerAnalysis(app: FastifyInstance, directory = 'analysis/sprint2') {
  const root = resolve(directory);
  async function asset(name: string) {
    try { return await readFile(resolve(root, name), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  app.get('/analysis/sprint2', { schema: { hide: true } }, async (_, reply) => {
    const body = await asset('report.html');
    if (body === undefined) return reply.code(404).send({ error: 'analysis_unavailable' });
    return reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'")
      .type('text/html; charset=utf-8').send(body);
  });
  app.get('/analysis/sprint2/data', { schema: { hide: true } }, async (_, reply) => {
    const body = await asset('analysis.json');
    return body === undefined ? reply.code(404).send({ error: 'analysis_unavailable' }) : reply.type('application/json').send(body);
  });
  app.get<{ Params: { id: string } }>('/analysis/sprint2/source/:id', {
    schema: { hide: true, params: { type: 'object', required: ['id'], additionalProperties: false,
      properties: { id: { type: 'string', pattern: '^[BCE][0-9]{2}$' } } } },
  }, async (request, reply) => {
    const body = await asset(`sources/${request.params.id}.txt`);
    return body === undefined ? reply.code(404).send({ error: 'source_not_found' }) : reply.type('text/plain; charset=utf-8').send(body);
  });
}
