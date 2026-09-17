import { buildApp } from './app.js';
import { postgresRepository } from './repository.js';
import { required } from '../shared/config.js';

const app = await buildApp({ repository: postgresRepository(), jwtSecret: required('JWT_SECRET'),
  logger: { level: 'info', redact: ['req.headers.authorization', 'req.body', 'password', 'access_token'],
    serializers: { req: req => ({ method: req.method }), err: () => ({ type: 'Error', message: 'Erro interno omitido', stack: '' }) } } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void app.close(); });
await app.listen({ host: '0.0.0.0', port: 3000 });
