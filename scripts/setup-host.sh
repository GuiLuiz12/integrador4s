#!/usr/bin/env bash
# Sourced by setup.sh. Functions are also exercised with isolated command doubles.
setup_message() { printf '[setup] %s\n' "$*"; }
setup_error() { printf '[setup] ERRO: %s\n' "$*" >&2; return 1; }
setup_admin() {
  if (( EUID == 0 )); then "$@";
  elif command -v sudo >/dev/null; then sudo "$@";
  else setup_error 'É necessário sudo ou acesso root para instalar os requisitos ausentes.'; fi
}
setup_read_os() { source /etc/os-release; }
setup_platform() {
  setup_read_os
  local major="${VERSION_ID%%.*}"
  if [[ "${ID:-}" != ubuntu ]] || [[ "${VERSION_ID:-}" != 24.04 && ! ( "$major" =~ ^[0-9]+$ && "$major" -ge 26 ) ]]; then
    setup_error 'Este setup suporta Ubuntu 24.04 e Ubuntu 26 ou superior.'; return 1
  fi
  [[ -n "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}" ]] || { setup_error 'Codinome do Ubuntu não identificado.'; return 1; }
  [[ "$(uname -m)" == x86_64 || "$(uname -m)" == aarch64 ]] || { setup_error 'É necessário Linux de 64 bits, x86_64 ou ARM64.'; return 1; }
  [[ "$(stat -fc %T /sys/fs/cgroup)" == cgroup2fs ]] || { setup_error 'O laboratório exige cgroups v2.'; return 1; }
  setup_message "Sistema: Ubuntu $VERSION_ID (${UBUNTU_CODENAME:-$VERSION_CODENAME})."
}
setup_resources() {
  local cpus memory disk
  cpus="$(getconf _NPROCESSORS_ONLN)"
  memory="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  disk="$(df -Pk "$LAB_ROOT" | awk 'END {print $4}')"
  (( cpus >= 6 )) || { setup_error "São necessárias 6 CPUs lógicas; encontradas: $cpus."; return 1; }
  # Nominal 8 GiB machines expose slightly less usable memory to the kernel.
  (( memory >= 7864320 )) || { setup_error 'São necessários 8 GiB de RAM (ao menos 7,5 GiB reconhecidos pelo sistema).'; return 1; }
  (( disk >= 15728640 )) || { setup_error 'Reserve pelo menos 15 GiB livres no disco do projeto para imagens e dados.'; return 1; }
  setup_message 'CPU, memória e espaço do projeto atendem aos requisitos.'
}
setup_package_installed() {
  [[ "$(dpkg-query -W -f='${Status}' "$1" 2>/dev/null || true)" == 'install ok installed' ]]
}
setup_compose_ready() {
  docker compose version >/dev/null 2>&1 && docker compose up --help 2>/dev/null | grep -q -- --wait-timeout
}
setup_install_packages() {
  (( $# > 0 )) || return 0
  setup_message "Instalando requisitos ausentes: $*. O sudo pode solicitar sua senha."
  setup_admin apt-get update
  setup_admin apt-get install --yes --no-remove "$@"
}
setup_docker_repository() {
  local codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}" arch
  arch="$(dpkg --print-architecture)"
  # Verify release support before adding an APT source, including future Ubuntu releases.
  curl --fail --silent --show-error --location --proto '=https' \
    "https://download.docker.com/linux/ubuntu/dists/$codename/Release" -o /dev/null || {
      setup_error "Docker ainda não oferece o repositório para Ubuntu $VERSION_ID ($codename), ou a rede está indisponível."; return 1;
    }
  if grep -Rqs 'download.docker.com/linux/ubuntu' /etc/apt/sources.list.d /etc/apt/sources.list 2>/dev/null; then
    return 0
  fi
  setup_admin install -m 0755 -d /etc/apt/keyrings
  # Fetch a signing key, never a remote installation script.
  curl --fail --silent --show-error --location --proto '=https' \
    https://download.docker.com/linux/ubuntu/gpg |
    setup_admin tee /etc/apt/keyrings/governanca-docker.asc >/dev/null
  setup_admin chmod 0644 /etc/apt/keyrings/governanca-docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/governanca-docker.asc\n' "$codename" "$arch" |
    setup_admin tee /etc/apt/sources.list.d/governanca-docker.sources >/dev/null
}
setup_dependencies() {
  local package
  local -a host_packages=() docker_packages=() conflicts=()
  command -v python3 >/dev/null || host_packages+=(python3)
  command -v curl >/dev/null || host_packages+=(curl)
  setup_package_installed ca-certificates || host_packages+=(ca-certificates)
  if ! command -v docker >/dev/null || ! command -v dockerd >/dev/null; then
    docker_packages+=(docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)
  else
    setup_compose_ready || docker_packages+=(docker-compose-plugin)
    docker buildx version >/dev/null 2>&1 || docker_packages+=(docker-buildx-plugin)
  fi
  if [[ "$SETUP_CHECK_ONLY" == 1 ]]; then
    if (( ${#host_packages[@]} + ${#docker_packages[@]} > 0 )); then
      setup_error "Requisitos ausentes: ${host_packages[*]} ${docker_packages[*]}. Execute npm run setup para instalar."; return 1
    fi
  else
    if (( ${#docker_packages[@]} > 0 )); then
      for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
        if setup_package_installed "$package"; then conflicts+=("$package"); fi
      done
      if (( ${#conflicts[@]} > 0 )); then
        setup_error "Instalação Docker incompleta com pacotes conflitantes: ${conflicts[*]}. Nenhum pacote foi removido; resolva essa instalação antes de repetir."; return 1
      fi
    fi
    setup_install_packages "${host_packages[@]}"
    if (( ${#docker_packages[@]} > 0 )); then
      setup_docker_repository
      setup_install_packages "${docker_packages[@]}"
    fi
  fi
  python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || {
    setup_error 'Python 3.10 ou superior é necessário para os comandos de evidência.'; return 1;
  }
  setup_compose_ready || { setup_error 'O Compose continua incompatível após verificar os pacotes; é necessário suporte a --wait-timeout.'; return 1; }
  setup_message 'Docker, Compose, Buildx e Python disponíveis.'
}
setup_daemon() {
  local endpoint details disk rootdir
  if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
    endpoint="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
  else
    endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
  fi
  [[ "$endpoint" == unix:///var/run/docker.sock || "$endpoint" == unix:///run/docker.sock ]] || {
    setup_error 'Use o Docker Engine local padrão; Docker remoto, Desktop e rootless não são suportados pelos coletores deste laboratório.'; return 1;
  }
  if ! docker info >/dev/null 2>&1; then
    if [[ "$SETUP_CHECK_ONLY" == 1 ]]; then
      # Read-only access may need the same sudo permission used during setup.
      setup_admin docker info >/dev/null || { setup_error 'Docker parado ou inacessível. Execute npm run setup.'; return 1; }
    fi
    if [[ "$SETUP_CHECK_ONLY" != 1 ]] && ! setup_admin docker info >/dev/null 2>&1; then
      setup_message 'Iniciando o serviço Docker.'
      setup_admin systemctl start docker
    fi
  fi
  details="$("$LAB_ROOT/scripts/docker.sh" info --format '{{.OSType}}|{{.CgroupVersion}}|{{json .SecurityOptions}}|{{.DockerRootDir}}')"
  [[ "$details" == linux\|2\|* && "$details" != *rootless* ]] || { setup_error 'O daemon precisa usar Linux, cgroups v2 e modo convencional.'; return 1; }
  rootdir="${details##*|}"
  [[ "$rootdir" == /var/lib/docker ]] || { setup_error "O cAdvisor deste laboratório espera os dados Docker em /var/lib/docker; encontrado: $rootdir."; return 1; }
  [[ -S /run/containerd/containerd.sock ]] || {
    setup_error 'O cAdvisor exige o socket containerd padrão em /run/containerd/containerd.sock. Confira o serviço containerd da instalação Docker local.'; return 1;
  }
  disk="$(df -Pk /var/lib/docker | awk 'END {print $4}')"
  (( disk >= 15728640 )) || { setup_error 'Reserve pelo menos 15 GiB livres no disco de dados do Docker.'; return 1; }
  setup_message 'Docker local acessível; armazenamento e coletores compatíveis.'
}
setup_environment() {
  local volumes
  if [[ ! -e "$LAB_ROOT/.env" && ! -L "$LAB_ROOT/.env" ]]; then
    volumes="$("$LAB_ROOT/scripts/docker.sh" volume ls --filter label=com.docker.compose.project=governanca-saude --format '{{.Name}}')"
    [[ -z "$volumes" ]] || { setup_error '.env ausente, mas existem volumes do laboratório. Restaure o .env original; novas senhas não seriam compatíveis com esses dados.'; return 1; }
  fi
  node "$LAB_ROOT/scripts/setup.mjs"
}
setup_main() {
  SETUP_CHECK_ONLY=0
  case "${1:-}" in
    '') ;;
    --check) SETUP_CHECK_ONLY=1 ;;
    --help|-h) printf 'Uso: npm run setup [-- --check]\nSem opção: verifica, instala requisitos ausentes e preserva/cria .env. Não sobe contêineres.\n--check (ou npm run setup:check): apenas verifica o host.\nDepois: npm start. Ubuntu 24.04 e >=26; internet e sudo quando faltarem pacotes.\n'; return 0 ;;
    *) setup_error 'Opção desconhecida. Use npm run setup -- --help.'; return 2 ;;
  esac
  (( $# <= 1 )) || { setup_error 'Informe somente uma opção.'; return 2; }
  cd "$LAB_ROOT"
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null || {
    setup_error 'Node >=22 é necessário. Execute ./bootstrap.sh primeiro.'; return 1;
  }
  setup_platform
  setup_resources
  setup_dependencies
  setup_daemon
  if [[ "$SETUP_CHECK_ONLY" == 1 ]]; then
    setup_message 'Host pronto. Nenhum pacote, arquivo ou serviço foi alterado.'
    return 0
  fi
  setup_environment
  setup_message 'Preparação concluída. Nenhum contêiner foi iniciado. Execute npm start.'
}
