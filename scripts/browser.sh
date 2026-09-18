#!/usr/bin/env bash
set -euo pipefail
LAB_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LAB_ROOT"
[[ -x node_modules/.bin/playwright ]] || { echo 'Ferramentas visuais exigem npm ci primeiro.' >&2; exit 1; }
action="${1:-}"
shift || true
# All visual commands share a persistent user cache; allow explicit overrides.
case "$action" in
  setup)
    (( $# == 0 )) || { echo 'Uso: npm run browser:setup' >&2; exit 2; }
    node_modules/.bin/playwright install chromium
    # A functional browser needs no APT operation (and no sudo prompt).
    probe='import { chromium } from "playwright"; const browser = await chromium.launch({ headless: true }); await browser.close();'
    diagnostic="$(mktemp)"
    trap 'rm -f -- "$diagnostic"' EXIT
    if ! node --input-type=module -e "$probe" >"$diagnostic" 2>&1; then
      if grep -Eq 'Host system is missing dependencies|error while loading shared libraries|Missing libraries:' "$diagnostic"; then
        echo 'Faltam bibliotecas do Chromium; instalando dependências do sistema (pode solicitar sudo).'
        node_modules/.bin/playwright install-deps chromium || {
          echo 'Não foi possível instalar as bibliotecas. Repita npm run browser:setup em um terminal com acesso sudo.' >&2
          exit 1
        }
        node --input-type=module -e "$probe"
      else
        cat "$diagnostic" >&2
        echo 'Chromium não iniciou. Resolva o erro acima e repita npm run browser:setup.' >&2
        exit 1
      fi
    fi
    echo 'Chromium pronto. Próximo passo: npm run dashboard:verify (com Grafana ativo).'
    ;;
  dashboard) exec node scripts/verify-dashboard.mjs "$@" ;;
  alerts) exec node scripts/capture-alerts.mjs "$@" ;;
  *) echo 'Use npm run browser:setup, dashboard:verify ou alerts:capture.' >&2; exit 2 ;;
esac
