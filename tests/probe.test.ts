import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { probe } from '../apps/lab/probe.js';

test('HTTP 200 com prontuário incorreto não é disponibilidade', async t => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url === '/auth/login' ? { access_token: 'synthetic-test-token' } : { id: 999, paciente: 'incorreto', resumo: 'fictício' }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const result = await probe(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { username: 'test', password: 'test' });
  assert.equal(result.success, 0);
});
test('timeout total cobre autenticação e leitura', async t => {
  const server = createServer((_request, _response) => {});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const result = await probe(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { username: 'test', password: 'test' }, 100);
  assert.equal(result.success, 0); assert.ok(result.duration < 1);
});
