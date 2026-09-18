#!/usr/bin/env bash
set -euo pipefail
LAB_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$LAB_ROOT/scripts/bootstrap-host.sh"
bootstrap_main "$@"
