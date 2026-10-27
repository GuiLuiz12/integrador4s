import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerAnalysis } from '../apps/api/analysis.js';

test('relatório e fontes são consultáveis sem permitir caminhos arbitrários', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sprint2-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'sources'));
  await writeFile(join(directory, 'report.html'), '<h1>Relatório</h1>');
  await writeFile(join(directory, 'analysis.json'), JSON.stringify({ incidents: 2 }));
  await writeFile(join(directory, 'sources', 'E03.txt'), 'evidência pública do cenário');
  const app = Fastify(); registerAnalysis(app, directory); t.after(() => app.close());
  const report = await app.inject('/analysis/sprint2');
  assert.equal(report.statusCode, 200);
  assert.match(report.headers['content-security-policy'] as string, /default-src 'none'/);
  assert.deepEqual((await app.inject('/analysis/sprint2/data')).json(), { incidents: 2 });
  assert.equal((await app.inject('/analysis/sprint2/source/E03')).body, 'evidência pública do cenário');
  assert.equal((await app.inject('/analysis/sprint2/source/E99')).statusCode, 404);
  for (const id of ['.env', '..%2F.env', 'E03.txt', 'E03%00']) {
    const response = await app.inject('/analysis/sprint2/source/' + id);
    assert.ok([400, 404].includes(response.statusCode), id);
    assert.ok(!response.body.includes(directory));
  }
});

test('artefatos ausentes retornam indisponibilidade explícita, sem dados inventados', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sprint2-empty-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = Fastify(); registerAnalysis(app, directory); t.after(() => app.close());
  assert.equal((await app.inject('/analysis/sprint2')).statusCode, 404);
  assert.deepEqual((await app.inject('/analysis/sprint2/data')).json(), { error: 'analysis_unavailable' });
});
