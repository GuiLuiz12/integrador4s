#!/usr/bin/env bash
# Only Node/npm and download prerequisites; no Docker, application packages or services.
bootstrap_message() { printf '[bootstrap] %s\n' "$*"; }
bootstrap_error() { printf '[bootstrap] ERRO: %s\n' "$*" >&2; return 1; }
bootstrap_admin() {
  if (( EUID == 0 )); then "$@";
  elif command -v sudo >/dev/null; then sudo "$@";
  else bootstrap_error 'É necessário sudo ou root para instalar Node/npm.'; fi
}
bootstrap_read_os() { source /etc/os-release; }
bootstrap_platform() {
  bootstrap_read_os
  local major="${VERSION_ID%%.*}"
  if [[ "${ID:-}" != ubuntu ]] || [[ "${VERSION_ID:-}" != 24.04 && ! ( "$major" =~ ^[0-9]+$ && "$major" -ge 26 ) ]]; then
    bootstrap_error 'Suportado: Ubuntu 24.04 e Ubuntu >=26.'; return 1
  fi
  BOOTSTRAP_VERSION=22.23.2
  BOOTSTRAP_PREFIX=/usr/local/lib/governanca-saude
  BOOTSTRAP_BIN=/usr/local/bin
  # Pinned from https://nodejs.org/dist/v22.23.2/SHASUMS256.txt.
  case "$(uname -m)" in
    x86_64) BOOTSTRAP_ARCH=x64; BOOTSTRAP_SHA=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307 ;;
    aarch64) BOOTSTRAP_ARCH=arm64; BOOTSTRAP_SHA=fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8 ;;
    *) bootstrap_error 'É necessário x86_64 ou ARM64.'; return 1 ;;
  esac
  BOOTSTRAP_NAME="node-v$BOOTSTRAP_VERSION-linux-$BOOTSTRAP_ARCH"
}
bootstrap_runtime_ready() {
  command -v node >/dev/null && command -v npm >/dev/null &&
    node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null &&
    npm --version >/dev/null 2>&1
}
bootstrap_paths() {
  local tool path target directory seen_bin
  for tool in node npm npx; do
    path="$BOOTSTRAP_BIN/$tool"
    if [[ -e "$path" || -L "$path" ]]; then
      target="$(readlink "$path" || true)"
      [[ "$target" == "$BOOTSTRAP_PREFIX"/node-v*/bin/"$tool" ]] || {
        bootstrap_error "Conflito em $path. Essa instalação não pertence ao laboratório; ajuste seu gerenciador Node para versão >=22 com npm e repita."; return 1;
      }
    fi
    seen_bin=0
    local -a directories
    IFS=: read -r -a directories <<< "$PATH"
    for directory in "${directories[@]}"; do
      if [[ "$directory" == "$BOOTSTRAP_BIN" ]]; then seen_bin=1; break; fi
      if [[ -x "${directory:-.}/$tool" ]]; then
        bootstrap_error "$tool em ${directory:-.} precede $BOOTSTRAP_BIN no PATH. Ative Node >=22 com npm nesse gerenciador ou ajuste o PATH antes de repetir."; return 1
      fi
    done
    (( seen_bin )) || { bootstrap_error "$BOOTSTRAP_BIN precisa constar no PATH antes de instalar."; return 1; }
  done
}
bootstrap_dependencies() {
  local -a missing=()
  command -v curl >/dev/null || missing+=(curl)
  command -v xz >/dev/null || missing+=(xz-utils)
  [[ "$(dpkg-query -W -f='${Status}' ca-certificates 2>/dev/null || true)" == 'install ok installed' ]] || missing+=(ca-certificates)
  if (( ${#missing[@]} )); then
    bootstrap_message "Instalando requisitos de download: ${missing[*]}."
    bootstrap_admin apt-get update
    bootstrap_admin apt-get install --yes --no-remove "${missing[@]}"
  fi
}
bootstrap_install_runtime() (
  local temporary archive destination tool
  destination="$BOOTSTRAP_PREFIX/$BOOTSTRAP_NAME"
  if [[ -e "$destination" || -L "$destination" ]]; then
    [[ -d "$destination" && ! -L "$destination" && -x "$destination/bin/node" ]] &&
      [[ "$("$destination/bin/node" --version)" == "v$BOOTSTRAP_VERSION" ]] &&
      "$destination/bin/node" "$destination/lib/node_modules/npm/bin/npm-cli.js" --version >/dev/null || {
        bootstrap_error "Instalação incompleta em $destination. Inspecione esse diretório antes de repetir; nada foi sobrescrito."; return 1;
      }
  else
    temporary="$(mktemp -d)"
    trap 'rm -rf -- "$temporary"' EXIT
    archive="$BOOTSTRAP_NAME.tar.xz"
    bootstrap_message "Baixando Node $BOOTSTRAP_VERSION ($BOOTSTRAP_ARCH) do servidor oficial."
    curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 20 --max-time 300 --retry 2 \
      "https://nodejs.org/dist/v$BOOTSTRAP_VERSION/$archive" -o "$temporary/$archive" || {
        bootstrap_error 'Download falhou. Nenhum runtime foi instalado; confira a rede e repita.'; return 1;
      }
    printf '%s  %s\n' "$BOOTSTRAP_SHA" "$temporary/$archive" | sha256sum --check --status || {
      bootstrap_error 'SHA-256 divergente. Download descartado; nenhum runtime foi instalado.'; return 1;
    }
    bootstrap_admin install -d -m 0755 "$BOOTSTRAP_PREFIX" "$BOOTSTRAP_BIN"
    bootstrap_admin tar --no-same-owner -xJf "$temporary/$archive" -C "$BOOTSTRAP_PREFIX"
  fi
  for tool in node npm npx; do
    bootstrap_admin ln -sfnT "$destination/bin/$tool" "$BOOTSTRAP_BIN/$tool"
  done
)
bootstrap_main() {
  case "${1:-}" in
    '') ;;
    --help|-h) printf 'Uso: ./bootstrap.sh\nPrepara somente Node >=22 e npm, preservando instalação compatível.\nDepois: npm run setup e npm start. Não instala Docker nem inicia serviços.\n'; return 0 ;;
    *) bootstrap_error 'Use ./bootstrap.sh ou ./bootstrap.sh --help.'; return 2 ;;
  esac
  (( $# == 0 )) || { bootstrap_error 'Não há argumentos adicionais.'; return 2; }
  bootstrap_platform
  if bootstrap_runtime_ready; then
    bootstrap_message "Node $(node --version) e npm $(npm --version) já disponíveis; instalação preservada."
  else
    bootstrap_paths
    bootstrap_dependencies
    bootstrap_install_runtime
    hash -r
    bootstrap_runtime_ready || { bootstrap_error 'Node/npm ainda não estão acessíveis. Confira o PATH e repita.'; return 1; }
    bootstrap_message "Node $(node --version) e npm $(npm --version) instalados."
  fi
  bootstrap_message 'Próximo passo: npm run setup; depois npm start. Não é necessário npm ci para operar.'
}
