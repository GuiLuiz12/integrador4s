import pg from 'pg';
import { required } from '../shared/config.js';

export type Professional = { id: number; username: string; password_hash: string; kind: 'clinical' | 'probe' };
export type RecordData = { id: number; paciente: string; resumo: string };
export interface Repository {
  professional(username: string): Promise<Professional | undefined>;
  record(id: number): Promise<RecordData | undefined>;
  ping(): Promise<void>;
  close(): Promise<void>;
}
export function postgresRepository(): Repository {
  const pool = new pg.Pool({ host: 'postgres', database: 'healthlab', user: 'clinical_reader',
    password: required('APP_DB_PASSWORD'), max: 5, connectionTimeoutMillis: 1000,
    query_timeout: 1500, statement_timeout: 1500 });
  // Connections may disappear during the controlled database outage.
  pool.on('error', () => {});
  return {
    async professional(username) {
      return (await pool.query<Professional>('SELECT id, username, password_hash, kind FROM professionals WHERE username = $1', [username])).rows[0];
    },
    async record(id) {
      return (await pool.query<RecordData>('SELECT id, paciente, resumo FROM prontuarios WHERE id = $1', [id])).rows[0];
    },
    async ping() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); },
  };
}
