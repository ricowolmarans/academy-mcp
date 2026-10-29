#!/usr/bin/env bash
# =============================================================================
# Creator AI / academy-mcp — full deploy script
# =============================================================================
# Usage:
#   ./deploy.sh                  # interactive: install, build, print MCP config
#   ./deploy.sh --non-interactive  # use existing .env, no prompts
#   ./deploy.sh --docker         # also build Docker image
#   ./deploy.sh --systemd        # install a systemd unit (Linux, needs sudo)
#   ./deploy.sh --nginx          # write Nginx sample config to ./deploy/nginx.conf
#   ./deploy.sh --push           # push to origin (git)
#   ./deploy.sh --all            # docker + nginx snippet + MCP config
#
# Required env (or .env):
#   CANVAS_BASE_URL
#   CANVAS_ACCESS_TOKEN
# Optional:
#   CANVAS_ACCOUNT_ID
#   CANVAS_TIMEOUT_MS
#   CANVAS_MAX_RETRIES
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── colours ────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'
  C_CYAN='\033[0;36m'; C_BOLD='\033[1m'; C_DIM='\033[2m'; C_RESET='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''; C_BOLD=''; C_DIM=''; C_RESET=''
fi

ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}!${C_RESET} $*"; }
err()  { echo -e "${C_RED}✗${C_RESET} $*" >&2; }
info() { echo -e "${C_CYAN}→${C_RESET} $*"; }
header() {
  echo
  echo -e "${C_BOLD}════════════════════════════════════════${C_RESET}"
  echo -e "${C_BOLD}  $*${C_RESET}"
  echo -e "${C_BOLD}════════════════════════════════════════${C_RESET}"
}

# ── flags ──────────────────────────────────────────────────────────────────
NON_INTERACTIVE=0
DO_DOCKER=0
DO_SYSTEMD=0
DO_NGINX=0
DO_PUSH=0
DO_START=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --non-interactive|-y) NON_INTERACTIVE=1 ;;
    --docker)             DO_DOCKER=1 ;;
    --systemd)            DO_SYSTEMD=1 ;;
    --nginx)              DO_NGINX=1 ;;
    --push)               DO_PUSH=1 ;;
    --start)              DO_START=1 ;;
    --skip-build)         SKIP_BUILD=1 ;;
    --all)
      DO_DOCKER=1
      DO_NGINX=1
      ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      err "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# ── preflight ──────────────────────────────────────────────────────────────
header "Creator AI deploy"

info "Project root: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js is required (v22+). Install from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  err "Node.js 22+ required (found $(node -v))"
  exit 1
fi
ok "Node $(node -v)"

if ! command -v npm >/dev/null 2>&1; then
  err "npm is required"
  exit 1
fi
ok "npm $(npm -v)"

# ── environment ────────────────────────────────────────────────────────────
header "Configuration"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    ok "Created .env from .env.example"
  else
    cat > .env << 'EOF'
CANVAS_BASE_URL=https://your-institution.instructure.com
CANVAS_ACCESS_TOKEN=
# CANVAS_ACCOUNT_ID=1
EOF
    ok "Created blank .env"
  fi
fi

# Load .env (simple KEY=VALUE, no export of comments)
set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a

prompt_if_empty() {
  local var="$1" hint="$2"
  local current="${!var:-}"
  if [[ -n "$current" && "$current" != "your_personal_access_token_here" && "$current" != *"your-institution"* ]]; then
    return 0
  fi
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    err "$var is not set. Edit .env or export it, then re-run."
    exit 1
  fi
  echo -e "${C_YELLOW}$hint${C_RESET}"
  read -r -p "$var= " value
  if [[ -z "$value" ]]; then
    err "$var is required"
    exit 1
  fi
  printf -v "$var" '%s' "$value"
  # Upsert into .env
  if grep -q "^${var}=" .env 2>/dev/null; then
    # portable-ish replace
    local tmp
    tmp="$(mktemp)"
    awk -v k="$var" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' .env > "$tmp"
    mv "$tmp" .env
  else
    echo "${var}=${value}" >> .env
  fi
}

prompt_if_empty CANVAS_BASE_URL "Canvas instance URL (no trailing slash), e.g. https://school.instructure.com"
prompt_if_empty CANVAS_ACCESS_TOKEN "Canvas Personal Access Token (Account → Settings → New Access Token)"

# Mask token for display
mask() {
  local t="$1"
  if [[ ${#t} -le 8 ]]; then echo "****"; else echo "${t:0:4}…${t: -4}"; fi
}

ok "CANVAS_BASE_URL=${CANVAS_BASE_URL}"
ok "CANVAS_ACCESS_TOKEN=$(mask "$CANVAS_ACCESS_TOKEN")"
[[ -n "${CANVAS_ACCOUNT_ID:-}" ]] && ok "CANVAS_ACCOUNT_ID=${CANVAS_ACCOUNT_ID}"

# ── install & build ────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  header "Install & build"

  info "npm install…"
  npm install --no-fund --no-audit
  ok "Dependencies installed"

  info "Typecheck & build…"
  if npm run typecheck 2>/dev/null; then
    ok "Typecheck passed"
  else
    warn "typecheck script missing or failed — continuing with build"
  fi

  npm run build
  ok "Built → dist/"

  if [[ -f dist/index.js ]]; then
    ok "Entry: dist/index.js"
  else
    err "dist/index.js not found after build"
    exit 1
  fi

  if npm test 2>/dev/null; then
    ok "Tests passed"
  else
    warn "Tests skipped or failed (non-fatal)"
  fi
else
  warn "Skipping install/build (--skip-build)"
fi

ABS_ENTRY="$ROOT/dist/index.js"

# ── MCP client config ──────────────────────────────────────────────────────
header "MCP client configuration"

mkdir -p deploy
MCP_JSON="$ROOT/deploy/mcp-config.snippet.json"

cat > "$MCP_JSON" << EOF
{
  "mcpServers": {
    "creator-ai": {
      "command": "node",
      "args": ["${ABS_ENTRY}"],
      "env": {
        "CANVAS_BASE_URL": "${CANVAS_BASE_URL}",
        "CANVAS_ACCESS_TOKEN": "${CANVAS_ACCESS_TOKEN}"
      }
    }
  }
}
EOF

ok "Wrote $MCP_JSON"

echo
echo -e "${C_DIM}Merge the creator-ai block into your client config:${C_RESET}"
echo -e "${C_DIM}  Claude Desktop (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json${C_RESET}"
echo -e "${C_DIM}  Claude Desktop (Windows): %APPDATA%\\Claude\\claude_desktop_config.json${C_RESET}"
echo -e "${C_DIM}  Cursor: Settings → MCP / .cursor/mcp.json${C_RESET}"
echo
cat "$MCP_JSON"
echo

# ── Docker ─────────────────────────────────────────────────────────────────
if [[ "$DO_DOCKER" -eq 1 ]]; then
  header "Docker image"

  if ! command -v docker >/dev/null 2>&1; then
    err "docker not found — skip image build"
  else
    IMAGE_NAME="${DOCKER_IMAGE:-creator-ai:latest}"
    info "Building $IMAGE_NAME …"
    docker build -t "$IMAGE_NAME" .
    ok "Image: $IMAGE_NAME"

    cat > deploy/docker-run.sh << EOF
#!/usr/bin/env bash
# Stdio MCP via Docker (client must spawn this with -i)
exec docker run --rm -i \\
  -e CANVAS_BASE_URL="${CANVAS_BASE_URL}" \\
  -e CANVAS_ACCESS_TOKEN="${CANVAS_ACCESS_TOKEN}" \\
  ${CANVAS_ACCOUNT_ID:+-e CANVAS_ACCOUNT_ID="${CANVAS_ACCOUNT_ID}"} \\
  ${IMAGE_NAME}
EOF
    chmod +x deploy/docker-run.sh
    ok "Wrote deploy/docker-run.sh"

    cat > deploy/mcp-config.docker.json << EOF
{
  "mcpServers": {
    "creator-ai": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "CANVAS_BASE_URL=${CANVAS_BASE_URL}",
        "-e", "CANVAS_ACCESS_TOKEN=${CANVAS_ACCESS_TOKEN}",
        "${IMAGE_NAME}"
      ]
    }
  }
}
EOF
    ok "Wrote deploy/mcp-config.docker.json"
  fi
fi

# ── Nginx sample (for future HTTP transport) ───────────────────────────────
if [[ "$DO_NGINX" -eq 1 ]]; then
  header "Nginx sample"

  DOMAIN="${DEPLOY_DOMAIN:-mcp.example.com}"
  UPSTREAM_PORT="${MCP_HTTP_PORT:-3000}"

  cat > deploy/nginx.conf << EOF
# Creator AI — sample reverse proxy for Streamable HTTP transport
# Only useful once the app listens on HTTP (not stdio).
# Place under /etc/nginx/sites-available/ and enable.

upstream creator_ai {
    server 127.0.0.1:${UPSTREAM_PORT};
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # Optional access control
    # allow 10.0.0.0/8;
    # deny all;
    # auth_basic "Creator AI";
    # auth_basic_user_file /etc/nginx/.htpasswd;

    location /mcp {
        proxy_pass http://creator_ai;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";

        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
  ok "Wrote deploy/nginx.conf (domain=${DOMAIN}, upstream=${UPSTREAM_PORT})"
  warn "Current server is stdio-only. Nginx applies after you add HTTP transport."
fi

# ── systemd (stdio is not a long-running daemon by default) ────────────────
if [[ "$DO_SYSTEMD" -eq 1 ]]; then
  header "systemd unit"

  # Stdio MCP is usually client-spawned. This unit is for an HTTP mode or
  # a keep-alive wrapper; still useful as a template.
  UNIT_NAME="${SYSTEMD_UNIT:-creator-ai}"
  UNIT_FILE="deploy/${UNIT_NAME}.service"

  cat > "$UNIT_FILE" << EOF
[Unit]
Description=Creator AI Canvas MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
EnvironmentFile=${ROOT}/.env
ExecStart=$(command -v node) ${ABS_ENTRY}
Restart=on-failure
RestartSec=5
User=${USER}
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${ROOT}

[Install]
WantedBy=multi-user.target
EOF
  ok "Wrote $UNIT_FILE"
  info "Install with:"
  echo "  sudo cp $UNIT_FILE /etc/systemd/system/"
  echo "  sudo systemctl daemon-reload"
  echo "  sudo systemctl enable --now ${UNIT_NAME}"
  warn "Stdio transport expects the MCP client to spawn the process; systemd suits HTTP mode better."
fi

# ── git push ───────────────────────────────────────────────────────────────
if [[ "$DO_PUSH" -eq 1 ]]; then
  header "Git push"

  if [[ ! -d .git ]]; then
    info "git init…"
    git init
    git add .
    git status
    if [[ "$NON_INTERACTIVE" -eq 0 ]]; then
      read -r -p "Commit message [Initial Creator AI MCP server]: " msg
      msg="${msg:-Initial Creator AI MCP server}"
    else
      msg="Initial Creator AI MCP server"
    fi
    git commit -m "$msg" || warn "Nothing to commit or commit failed"
    git branch -M main 2>/dev/null || true
  fi

  if ! git remote get-url origin >/dev/null 2>&1; then
    DEFAULT_REMOTE="https://github.com/ricowolmarans/academy-mcp.git"
    if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
      git remote add origin "$DEFAULT_REMOTE"
    else
      read -r -p "Git remote URL [$DEFAULT_REMOTE]: " remote
      remote="${remote:-$DEFAULT_REMOTE}"
      git remote add origin "$remote"
    fi
  fi

  info "Pushing to origin…"
  if git push -u origin main; then
    ok "Pushed to $(git remote get-url origin)"
  else
    err "Push failed — check auth (gh auth login / SSH keys) and remote"
  fi
fi

# ── optional smoke start ───────────────────────────────────────────────────
if [[ "$DO_START" -eq 1 ]]; then
  header "Smoke start (stdio)"
  info "Starting briefly to verify config (Ctrl+C to stop if left running)…"
  # Run with timeout if available so deploy doesn't hang
  if command -v timeout >/dev/null 2>&1; then
    timeout 3 node "$ABS_ENTRY" || true
  else
    warn "timeout not available — not auto-starting long-lived stdio process"
  fi
fi

# ── summary ────────────────────────────────────────────────────────────────
header "Done"

echo -e "${C_GREEN}Deploy artefacts:${C_RESET}"
echo "  .env"
echo "  dist/index.js"
echo "  deploy/mcp-config.snippet.json"
[[ "$DO_DOCKER" -eq 1 ]] && echo "  deploy/mcp-config.docker.json  deploy/docker-run.sh"
[[ "$DO_NGINX" -eq 1 ]]  && echo "  deploy/nginx.conf"
[[ "$DO_SYSTEMD" -eq 1 ]] && echo "  deploy/*.service"
echo
echo -e "${C_BOLD}Next steps:${C_RESET}"
echo "  1. Merge deploy/mcp-config.snippet.json into your MCP client config"
echo "  2. Restart Claude Desktop / Cursor"
echo "  3. Ask the assistant to call: canvas_status  or  list_courses"
echo
echo -e "${C_DIM}Examples:${C_RESET}"
echo "  ./deploy.sh"
echo "  ./deploy.sh --docker --nginx"
echo "  ./deploy.sh --push"
echo "  ./deploy.sh --all --non-interactive"
echo
ok "Creator AI is ready."
