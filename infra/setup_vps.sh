#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERRO] Este script precisa ser executado como root (use sudo)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

PACKAGE_MANAGER=""
if command -v apt-get >/dev/null 2>&1; then
  PACKAGE_MANAGER="apt"
elif command -v dnf >/dev/null 2>&1; then
  PACKAGE_MANAGER="dnf"
elif command -v yum >/dev/null 2>&1; then
  PACKAGE_MANAGER="yum"
else
  echo "[ERRO] Nenhum gerenciador de pacotes suportado (apt, dnf ou yum) foi encontrado." >&2
  exit 1
fi

UPDATED_ONCE=0
ensure_package_metadata() {
  case "${PACKAGE_MANAGER}" in
    apt)
      if [[ "${UPDATED_ONCE}" -eq 0 ]]; then
        apt-get update
        UPDATED_ONCE=1
      fi
      ;;
  esac
}

package_available() {
  local pkg="$1"
  case "${PACKAGE_MANAGER}" in
    apt)
      ensure_package_metadata
      apt-cache show "${pkg}" >/dev/null 2>&1
      ;;
    dnf)
      dnf list --available "${pkg}" >/dev/null 2>&1
      ;;
    yum)
      yum list available "${pkg}" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

install_packages() {
  if [ "$#" -eq 0 ]; then
    return
  fi
  case "${PACKAGE_MANAGER}" in
    apt)
      ensure_package_metadata
      DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf)
      dnf install -y "$@"
      ;;
    yum)
      yum install -y "$@"
      ;;
  esac
}

log_section() {
  echo
  echo "===================="
  echo "$1"
  echo "===================="
}

ensure_base_packages() {
  log_section "Instalando dependências básicas"
  case "${PACKAGE_MANAGER}" in
    apt)
      install_packages ca-certificates curl git python3 openssh-client
      ;;
    dnf|yum)
      install_packages ca-certificates curl git python3 openssh-clients
      ;;
  esac
}

install_docker() {
  log_section "Verificando Docker"
  if ! command -v docker >/dev/null 2>&1; then
    if [[ "${PACKAGE_MANAGER}" == "apt" ]]; then
      echo "Docker não encontrado. Instalando via repositório oficial (apt)..."

      install_packages ca-certificates curl gnupg

      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc

      local codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
      local arch="$(dpkg --print-architecture)"
      echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
        > /etc/apt/sources.list.d/docker.list

      apt-get update

      local docker_packages=(
        docker-ce
        docker-ce-cli
        containerd.io
        docker-compose-plugin
        docker-ce-rootless-extras
        docker-buildx-plugin
      )

      local available_packages=()
      local pkg
      for pkg in "${docker_packages[@]}"; do
        if package_available "${pkg}"; then
          available_packages+=("${pkg}")
        fi
      done

      if [[ "${#available_packages[@]}" -eq 0 ]]; then
        echo "[ERRO] Nenhum pacote Docker disponível para instalação via apt." >&2
        exit 1
      fi

      install_packages "${available_packages[@]}"
    else
      echo "Docker não encontrado. Instalando via script oficial..."
      curl -fsSL https://get.docker.com | sh
    fi
  else
    echo "Docker já instalado."
  fi

  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q docker.service; then
    systemctl enable docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  fi
}

COMPOSE_CMD=()
ensure_compose() {
  log_section "Verificando Docker Compose"
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    echo "Usando 'docker compose'."
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    echo "Usando 'docker-compose'."
    return
  fi

  echo "Docker Compose não encontrado. Instalando pacote..."
  local install_candidates=(docker-compose-plugin docker-compose)
  local installed=0
  for candidate in "${install_candidates[@]}"; do
    if package_available "${candidate}"; then
      if install_packages "${candidate}"; then
        installed=1
        break
      fi
    fi
  done

  if [[ "${installed}" -eq 0 ]]; then
    echo "Nenhum pacote disponível via gerenciador."
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    echo "Usando 'docker compose'."
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    echo "Usando 'docker-compose'."
    return
  fi

  echo "Download direto do binário do Docker Compose..."
  local compose_url="https://github.com/docker/compose/releases/download/v2.24.7/docker-compose-$(uname -s)-$(uname -m)"
  curl -L "${compose_url}" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    echo "Usando 'docker-compose'."
  else
    echo "[ERRO] Falha ao instalar o Docker Compose." >&2
    exit 1
  fi
}

ensure_deploy_key() {
  log_section "Gerando chave SSH para deploy"

  local ssh_dir="${HOME}/.ssh"
  local default_key_path="${ssh_dir}/ai_hub_deploy"

  mkdir -p "${ssh_dir}"
  chmod 700 "${ssh_dir}"

  prompt_with_default DEPLOY_KEY_PATH "Caminho para salvar a chave privada" "${default_key_path}"
  local key_file="${DEPLOY_KEY_PATH}"
  local pub_file="${key_file}.pub"

  if [ -f "${key_file}" ] || [ -f "${pub_file}" ]; then
    echo "Uma chave já existe em ${key_file}."
    local regenerate="n"
    read -r -p "Deseja gerar uma nova chave? (s/N): " regenerate
    case "${regenerate}" in
      [sS]|[sS][iI][mM])
        local ts
        ts="$(date +%Y%m%d%H%M%S)"
        mv "${key_file}" "${key_file}.backup.${ts}" 2>/dev/null || true
        mv "${pub_file}" "${pub_file}.backup.${ts}" 2>/dev/null || true
        echo "Backups criados com sufixo .backup.${ts}."
        ssh-keygen -t ed25519 -C "ai-hub-deploy" -N "" -f "${key_file}"
        ;;
      *)
        echo "Mantendo chave existente."
        ;;
    esac
  else
    ssh-keygen -t ed25519 -C "ai-hub-deploy" -N "" -f "${key_file}"
  fi

  chmod 600 "${key_file}" 2>/dev/null || true
  chmod 600 "${pub_file}" 2>/dev/null || true

  local authorized_keys="${ssh_dir}/authorized_keys"
  touch "${authorized_keys}"
  chmod 600 "${authorized_keys}"

  if ! grep -q "ai-hub-deploy" "${authorized_keys}" 2>/dev/null; then
    cat "${pub_file}" >> "${authorized_keys}"
    echo "Chave pública adicionada a ${authorized_keys}."
  else
    echo "Chave pública já presente em ${authorized_keys}."
  fi

  cat <<EOF

Copie o conteúdo do arquivo ${key_file} e cadastre como segredo em:
  GitHub → Settings → Secrets and variables → Actions → New repository secret
Sugestão de nome: VPS_SSH_KEY

O conteúdo de ${pub_file} já foi incluído em ${authorized_keys} e permitirá o acesso via deploy.

EOF
}

prompt_with_default() {
  local __var="$1"; shift
  local __prompt="$1"; shift
  local __default="${1-}"
  local __value=""
  if [ -n "${__default}" ]; then
    read -r -p "${__prompt} [${__default}]: " __value
  else
    read -r -p "${__prompt}: " __value
  fi
  if [ -z "${__value}" ]; then
    __value="${__default}"
  fi
  printf -v "${__var}" '%s' "${__value}"
}

prompt_secret() {
  local __var="$1"; shift
  local __prompt="$1"; shift
  local __default="${1-}"
  local __value=""
  if [ -n "${__default}" ]; then
    read -r -s -p "${__prompt} [${__default}]: " __value
  else
    read -r -s -p "${__prompt}: " __value
  fi
  echo
  if [ -z "${__value}" ]; then
    __value="${__default}"
  fi
  printf -v "${__var}" '%s' "${__value}"
}

collect_env_values() {
  log_section "Coletando variáveis de ambiente"

  prompt_with_default FRONTEND_HTTP_PORT "Porta externa para o frontend" "80"
  prompt_with_default BACKEND_HTTP_PORT "Porta externa para o backend" "8081"
  prompt_with_default SANDBOX_ORCHESTRATOR_HTTP_PORT "Porta externa para o sandbox" "8083"

  local default_public_url="http://localhost:${BACKEND_HTTP_PORT}"
  prompt_with_default HUB_PUBLIC_URL "URL pública da API (ex: https://app.seudominio.com)" "${default_public_url}"

  local default_frontend_origin="http://localhost:${FRONTEND_HTTP_PORT}"
  prompt_with_default HUB_ALLOWED_ORIGINS "Origens CORS permitidas (separe por vírgula)" "${default_frontend_origin}"
  prompt_with_default HUB_CORS_ALLOW_CREDENTIALS "Permitir credenciais em CORS (true/false)" "false"

  prompt_with_default VITE_API_BASE_URL "Base da API usada pelo frontend" "/api"

  prompt_with_default OPENAI_MODEL "Modelo da OpenAI" "gpt-5-codex"

  prompt_secret OPENAI_API_KEY "OPENAI_API_KEY (Enter para deixar vazio)"

  cat <<'EOF'

Referência rápida para preencher as credenciais da GitHub App:
  • GitHub → Settings → Developer settings → GitHub Apps → escolha a app (ex.: ai-hub-automations).
  • Aba General → seção About: copie o número "App ID" (ex.: 212632) para GITHUB_APP_ID.
  • Aba General → clique em "Generate a private key" caso ainda não tenha o arquivo .pem.
  • Aba General → seção Webhook: clique em Edit para ver/definir o segredo usado em GITHUB_WEBHOOK_SECRET.
  • Menu lateral → Install App → abra a instalação e pegue o número final da URL (/installations/<id>) para GITHUB_INSTALLATION_ID.

Se ainda não tiver uma homepage própria, use a URL pública da app (https://github.com/settings/apps/<slug>) temporariamente.

EOF

  prompt_with_default GITHUB_APP_ID "GITHUB_APP_ID" ""
  prompt_with_default GITHUB_INSTALLATION_ID "GITHUB_INSTALLATION_ID" ""
  prompt_secret GITHUB_WEBHOOK_SECRET "GITHUB_WEBHOOK_SECRET (Enter para deixar vazio)"
  prompt_with_default GITHUB_ORG_DEFAULT "GITHUB_ORG_DEFAULT (opcional)" ""

  echo
  echo "Configurando banco de dados MySQL provisionado na hospedagem"
  DB_URL="jdbc:mysql://d555d.vps-kinghost.net:3306/aihubdb"
  DB_USER="aihubdb_user"
  DB_PASS="A9m#Q2v@T7x%L4n*Z6p+H3c&B8d-K1r5J"

  echo
  echo "Para o GITHUB_PRIVATE_KEY_PEM você pode informar um caminho para o arquivo .pem."
  echo "Se preferir, cole o valor já com quebras de linha escapadas (\\n)."
  echo "Se acabou de registrar a app e viu a mensagem 'Registration successful! You must generate a private key...',"
  echo "clique em 'Generate a private key' na aba General para baixar o arquivo antes de prosseguir."
  local key_path=""
  read -r -p "Caminho do arquivo .pem (Enter para pular): " key_path
  local key_value=""
  if [ -n "${key_path}" ]; then
    if [ -f "${key_path}" ]; then
      key_value="$(python3 - "$key_path" <<'PY'
import sys
from pathlib import Path
text = Path(sys.argv[1]).read_text().strip()
print(text.replace('\n', '\\n'))
PY
)"
    else
      echo "[AVISO] Arquivo não encontrado. A variável ficará vazia."
    fi
  fi
  if [ -z "${key_value}" ]; then
    read -r -p "GITHUB_PRIVATE_KEY_PEM (use \\n para quebras de linha, Enter para deixar vazio): " key_value
  fi
  GITHUB_PRIVATE_KEY_PEM="${key_value}"
}

create_env_file() {
  log_section "Gerando arquivo .env"
  local env_file="${REPO_DIR}/.env"
  if [ -f "${env_file}" ]; then
    local backup="${env_file}.backup.$(date +%Y%m%d%H%M%S)"
    cp "${env_file}" "${backup}"
    echo "Backup criado: ${backup}"
  fi

  {
    printf 'OPENAI_API_KEY=%s\n' "${OPENAI_API_KEY}"
    printf 'OPENAI_MODEL=%s\n' "${OPENAI_MODEL}"
    printf 'GITHUB_APP_ID=%s\n' "${GITHUB_APP_ID}"
    printf 'GITHUB_PRIVATE_KEY_PEM="%s"\n' "${GITHUB_PRIVATE_KEY_PEM}"
    printf 'GITHUB_INSTALLATION_ID=%s\n' "${GITHUB_INSTALLATION_ID}"
    printf 'GITHUB_WEBHOOK_SECRET=%s\n' "${GITHUB_WEBHOOK_SECRET}"
    printf 'GITHUB_ORG_DEFAULT=%s\n' "${GITHUB_ORG_DEFAULT}"
    printf 'DB_URL=%s\n' "${DB_URL}"
    printf 'DB_USER=%s\n' "${DB_USER}"
    printf 'DB_PASS=%s\n' "${DB_PASS}"
    printf 'HUB_PUBLIC_URL=%s\n' "${HUB_PUBLIC_URL}"
    printf 'HUB_ALLOWED_ORIGINS=%s\n' "${HUB_ALLOWED_ORIGINS}"
    printf 'HUB_CORS_ALLOW_CREDENTIALS=%s\n' "${HUB_CORS_ALLOW_CREDENTIALS}"
    printf 'VITE_API_BASE_URL=%s\n' "${VITE_API_BASE_URL}"
    printf 'FRONTEND_HTTP_PORT=%s\n' "${FRONTEND_HTTP_PORT}"
    printf 'BACKEND_HTTP_PORT=%s\n' "${BACKEND_HTTP_PORT}"
    printf 'SANDBOX_ORCHESTRATOR_HTTP_PORT=%s\n' "${SANDBOX_ORCHESTRATOR_HTTP_PORT}"
    printf 'BACKEND_IMAGE=%s\n' "${BACKEND_IMAGE:-ghcr.io/paulofor/ai-hub-3-backend:latest}"
    printf 'FRONTEND_IMAGE=%s\n' "${FRONTEND_IMAGE:-ghcr.io/paulofor/ai-hub-3-frontend:latest}"
    printf 'SANDBOX_ORCHESTRATOR_IMAGE=%s\n' "${SANDBOX_ORCHESTRATOR_IMAGE:-ghcr.io/paulofor/ai-hub-3-sandbox:latest}"
  } > "${env_file}"

  chmod 600 "${env_file}"
}

bring_up_stack() {
  log_section "Construindo e subindo os contêineres"
  "${COMPOSE_CMD[@]}" down --remove-orphans >/dev/null 2>&1 || true
  "${COMPOSE_CMD[@]}" pull
  "${COMPOSE_CMD[@]}" up --build -d
}

print_summary() {
  cat <<EOF

Configuração concluída! Principais informações:
- Diretório do projeto: ${REPO_DIR}
- Arquivo de variáveis: ${REPO_DIR}/.env
- Frontend publicado na porta: ${FRONTEND_HTTP_PORT}
- Backend publicado na porta: ${BACKEND_HTTP_PORT}
- Sandbox publicado na porta: ${SANDBOX_ORCHESTRATOR_HTTP_PORT}
- Banco de dados externo: jdbc:mysql://d555d.vps-kinghost.net:3306/aihubdb
- Chave privada do deploy: ${DEPLOY_KEY_PATH}
- authorized_keys atualizado em: ${HOME}/.ssh/authorized_keys

Use "${COMPOSE_CMD[*]} logs -f" para acompanhar os serviços.

EOF
}

ensure_base_packages
install_docker
ensure_compose
ensure_deploy_key
collect_env_values
create_env_file
bring_up_stack
print_summary
