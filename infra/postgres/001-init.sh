#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set app_password="$APP_DB_PASSWORD" \
  --set prof_1_hash="$PROF_1_HASH" --set prof_2_hash="$PROF_2_HASH" --set probe_hash="$PROBE_HASH" <<'SQL'
SELECT format('CREATE ROLE clinical_reader LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'clinical_reader') \gexec
REVOKE ALL ON DATABASE healthlab FROM PUBLIC;
GRANT CONNECT ON DATABASE healthlab TO clinical_reader;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO clinical_reader;
CREATE TABLE IF NOT EXISTS professionals (
  id integer PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('clinical', 'probe'))
);
CREATE TABLE IF NOT EXISTS prontuarios (id integer PRIMARY KEY, paciente text NOT NULL, resumo text NOT NULL);
INSERT INTO professionals VALUES
  (1, 'profissional1', :'prof_1_hash', 'clinical'),
  (2, 'profissional2', :'prof_2_hash', 'clinical'),
  (3, 'monitor', :'probe_hash', 'probe')
ON CONFLICT (id) DO NOTHING;
INSERT INTO prontuarios
SELECT n, 'Paciente fictício ' || lpad(n::text, 3, '0'), 'Registro inteiramente fictício para demonstração do laboratório.'
FROM generate_series(1,100) n ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON professionals, prontuarios TO clinical_reader;
SQL
