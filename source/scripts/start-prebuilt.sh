#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[start-prebuilt] %s\n' "$1"
}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
WORKSPACE_DIR=$(cd "$SOURCE_DIR/.." && pwd)
RUNTIME_DIR="$WORKSPACE_DIR/runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
ENV_FILE="$SOURCE_DIR/.env"
RUST_BIN="$WORKSPACE_DIR/bin/kalisi-gateway"
AGENT_BIN="$WORKSPACE_DIR/bin/agent-runtime-service"

mkdir -p "$LOG_DIR" "$PID_DIR"

if [ ! -f "$ENV_FILE" ]; then
  log "Error: .env not found at $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

ensure_https_capability() {
  if [ "${ENABLE_HTTPS:-false}" = "true" ] && [ "${HTTPS_PORT:-0}" -lt 1024 ]; then
    if command -v setcap >/dev/null 2>&1; then
      if sudo setcap 'cap_net_bind_service=+ep' "$RUST_BIN" >/dev/null 2>&1; then
        log "Applied cap_net_bind_service to kalisi-gateway"
      else
        log "Warning: unable to set HTTPS capability; HTTPS on privileged ports may fail"
      fi
    else
      log "Warning: setcap not available; HTTPS on privileged ports may fail"
    fi
  fi
}

ensure_frontend_assets() {
  local runtime_dist="$RUNTIME_DIR/frontend/dist"
  local source_frontend="$SOURCE_DIR/frontend"
  local source_dist="$source_frontend/dist"

  if [ ! -d "$runtime_dist" ]; then
    log "Warning: prebuilt frontend bundle missing at $runtime_dist"
    return
  fi

  mkdir -p "$source_frontend"

  if [ -L "$source_dist" ]; then
    if [ "$(readlink "$source_dist")" = "$runtime_dist" ]; then
      return
    fi
    rm -f "$source_dist"
  elif [ -e "$source_dist" ]; then
    rm -rf "$source_dist"
  fi

  ln -s "$runtime_dist" "$source_dist"
  log "Linked prebuilt frontend bundle into $source_dist"
}

start_redis() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    log "Redis already running"
    return
  fi

  log "Starting Redis"
  if command -v systemctl >/dev/null 2>&1 && sudo systemctl start redis-server >/dev/null 2>&1; then
    log "Redis started via systemctl"
    return
  fi
  if redis-server --daemonize yes >/dev/null 2>&1; then
    log "Redis started via redis-server --daemonize"
    return
  fi
  if command -v service >/dev/null 2>&1 && sudo service redis-server start >/dev/null 2>&1; then
    log "Redis started via service"
    return
  fi
  log "Warning: Redis could not be started automatically"
}

start_neo4j() {
  local neo4j_status
  if command -v curl >/dev/null 2>&1; then
    neo4j_status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://localhost:${NEO4J_HTTP_PORT:-7474}" || true)
    if [ "$neo4j_status" = "200" ] || [ "$neo4j_status" = "401" ]; then
      log "Neo4j already running"
      return
    fi
  fi

  log "Starting Neo4j"
  if command -v systemctl >/dev/null 2>&1 && sudo systemctl start neo4j >/dev/null 2>&1; then
    log "Neo4j started via systemctl"
    return
  fi
  if command -v neo4j >/dev/null 2>&1 && sudo neo4j start >/dev/null 2>&1; then
    log "Neo4j started via neo4j CLI"
    return
  fi
  if command -v service >/dev/null 2>&1 && sudo service neo4j start >/dev/null 2>&1; then
    log "Neo4j started via service"
    return
  fi
  log "Warning: Neo4j could not be started automatically"
}

start_gateway() {
  if pgrep -x "kalisi-gateway" >/dev/null 2>&1; then
    log "Gateway already running"
    return
  fi

  if [ ! -x "$RUST_BIN" ]; then
    log "Error: gateway binary missing at $RUST_BIN"
    exit 1
  fi

  ensure_https_capability

  if [ "${ENABLE_HTTPS:-false}" = "true" ]; then
    local cert_dir="$SOURCE_DIR/certs"
    local fullchain="$cert_dir/fullchain.pem"
    local privkey="$cert_dir/privkey.pem"

    if [ ! -f "$fullchain" ] || [ ! -f "$privkey" ]; then
      log "Generating self-signed TLS certificates"
      mkdir -p "$cert_dir"
      openssl req -x509 -newkey rsa:4096 \
        -keyout "$privkey" \
        -out "$fullchain" \
        -days 365 \
        -nodes \
        -subj "/C=US/ST=State/L=City/O=Kalisi/CN=localhost" >/dev/null 2>&1
      chmod 600 "$privkey" 2>/dev/null || true
    fi
  fi

  local log_file="$LOG_DIR/kalisi-gateway.log"
  log "Starting Kalisi gateway (logs: $log_file)"
  nohup "$RUST_BIN" >>"$log_file" 2>&1 &
  local pid=$!
  echo $pid > "$PID_DIR/kalisi-gateway.pid"

  for _ in {1..30}; do
    if pgrep -x "kalisi-gateway" >/dev/null 2>&1; then
      log "Gateway started (PID: $pid)"
      return
    fi
    sleep 1
  done

  log "Warning: gateway launch timed out"
}

start_agent_runtime() {
  if [ ! -x "$AGENT_BIN" ]; then
    log "Agent runtime binary not found; skipping"
    return
  fi
  if pgrep -x "agent-runtime-service" >/dev/null 2>&1; then
    log "Agent runtime already running"
    return
  fi
  local log_file="$LOG_DIR/agent-runtime.log"
  log "Starting agent runtime (logs: $log_file)"
  nohup "$AGENT_BIN" >>"$log_file" 2>&1 &
  echo $! > "$PID_DIR/agent-runtime.pid"
}

start_redis
start_neo4j
ensure_frontend_assets
start_gateway
start_agent_runtime

log "Prebuilt startup complete"
