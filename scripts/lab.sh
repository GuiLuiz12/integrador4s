#!/usr/bin/env bash
set -euo pipefail
LAB_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LAB_ROOT"
compose() { docker compose --env-file "$LAB_ROOT/.env" -f "$LAB_ROOT/infra/compose.yaml" "$@"; }
cli() { compose exec -T lab node dist/apps/lab/cli.js "$@"; }
command="${1:-help}"
shift || true
case "$command" in
  up) compose up -d --build --wait --wait-timeout 180 ;;
  down) compose down ;;
  status) compose ps ;;
  check-api) cli check-api ;;
  db-ready) compose exec -T postgres pg_isready -U lab_owner -d healthlab ;;
  restore-db) compose start postgres ;;
  restore-collector) compose start lab ;;
  load) cli load "${1:-1}" "${2:-3600}" ;;
  invalid-logins) cli invalid-logins ;;
  query) cli query "${1:-up}" ;;
  fail-db|fail-collector)
    seconds="${1:-120}"
    if [[ ! "$seconds" =~ ^[0-9]+$ ]] || (( seconds < 1 || seconds > 600 )); then
      echo 'Duração deve ser de 1 a 600 segundos.' >&2; exit 2
    fi
    service=postgres
    if [[ "$command" == fail-collector ]]; then service=lab; fi
    timer_pid=''
    restore() {
      trap - EXIT INT TERM
      if [[ -n "$timer_pid" ]]; then
        kill "$timer_pid" 2>/dev/null || true
        wait "$timer_pid" 2>/dev/null || true
      fi
      compose start "$service"
    }
    trap restore EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    printf '%s interrupção de %s por %s s\n' "$(date -u +%FT%TZ)" "$service" "$seconds"
    compose stop -t 5 "$service"
    sleep "$seconds" &
    timer_pid=$!
    wait "$timer_pid"
    timer_pid=''
    ;;
  evidence) python3 scripts/evidence.py "$@" ;;
  session) python3 scripts/session.py "$@" ;;
  rules-test)
    compose run --rm --no-deps --entrypoint promtool -v "$LAB_ROOT/monitoring:/tests:ro" prometheus test rules /tests/rules.test.yml
    ;;
  config-check) compose config --quiet ;;
  *) echo 'Uso: ./scripts/lab.sh {up|down|status|check-api|db-ready|load RATE SECONDS|invalid-logins|query PROMQL|fail-db SECONDS|fail-collector SECONDS|restore-db|restore-collector|evidence|session|rules-test|config-check}' ;;
esac
