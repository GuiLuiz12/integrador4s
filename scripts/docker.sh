#!/usr/bin/env bash
# Project-local Docker access; does not change group membership or socket permissions.
set -euo pipefail
if ! command -v docker >/dev/null; then
  echo 'Docker não encontrado. Execute npm run setup na raiz do projeto.' >&2
  exit 1
fi
if docker info >/dev/null 2>&1; then
  exec docker "$@"
fi
if (( EUID != 0 )) && command -v sudo >/dev/null && [[ -S /var/run/docker.sock ]]; then
  exec sudo docker "$@"
fi
echo 'Docker indisponível. Execute npm run setup para verificar e iniciar o daemon.' >&2
exit 1
