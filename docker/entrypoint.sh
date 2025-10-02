#!/usr/bin/env bash
set -euo pipefail

WORKSPACE=${WORKSPACE_ROOT:-/workspace}
TEMPLATE_ROOT=${WORKSPACE_TEMPLATE:-/opt/bootstrap/workspace-template}
NEO4J_HOME=${NEO4J_HOME:-/opt/neo4j}
NEO4J_DATA_ROOT=${NEO4J_DATA_ROOT:-/data/neo4j}
REDIS_DATA_ROOT=${REDIS_DATA_ROOT:-/data/redis}
SSH_USER=${SSH_USER:-kalisi}
SSH_HOME="/home/${SSH_USER}"
AUTHORIZED_KEYS_VALUE=${AUTHORIZED_KEYS:-}
SSH_PASSWORD=${SSH_PASSWORD:-kalisi}
SSH_ENABLE_PASSWORD=${SSH_ENABLE_PASSWORD:-false}

log() {
  printf '[entrypoint] %s\n' "$1"
}

compute_template_version() {
  local version=""
  if [ -d "$TEMPLATE_ROOT/.git" ]; then
    git config --global --add safe.directory "$TEMPLATE_ROOT" 2>/dev/null || true
    version=$(git -C "$TEMPLATE_ROOT" rev-parse HEAD 2>/dev/null || echo "")
    if [ -n "$version" ]; then
      printf '%s\n' "$version"
      return
    fi
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$TEMPLATE_ROOT" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
digest = hashlib.sha256()

for current, dirs, files in os.walk(root):
    rel_dir = os.path.relpath(current, root)
    if rel_dir == '.git':
        dirs[:] = []
        continue
    dirs.sort()
    files.sort()
    digest.update(rel_dir.encode('utf-8', 'surrogateescape'))
    for name in files:
        if name == '.workspace-template-version':
            continue
        path = os.path.join(current, name)
        rel_file = os.path.relpath(path, root)
        digest.update(rel_file.encode('utf-8', 'surrogateescape'))
        try:
            with open(path, 'rb') as fh:
                for chunk in iter(lambda: fh.read(131072), b''):
                    digest.update(chunk)
        except OSError:
            continue

print(digest.hexdigest())
PY
    return
  fi
  printf 'fallback-%s\n' "$(date +%s)"
}

ensure_workspace() {
  if [ ! -d "$WORKSPACE" ]; then
    mkdir -p "$WORKSPACE"
    chown "$SSH_USER:$SSH_USER" "$WORKSPACE"
  fi

  # Treat the workspace as empty if it only contains the runtime mount. This
  # happens because docker creates the runtime dir before the entrypoint runs
  # in order to satisfy the bind-mount for runtime/.env. Without this check the
  # initial rsync never runs and the workspace stays empty.
  local non_runtime_content
  non_runtime_content=$(find "$WORKSPACE" -mindepth 1 -maxdepth 1 \
    -not -path "$WORKSPACE/runtime" \
    -not -path "$WORKSPACE/runtime"'/*' \
    -print -quit 2>/dev/null || true)

  local template_version
  template_version=$(compute_template_version)

  local sentinel="$WORKSPACE/.workspace-template-version"
  local current_version=""
  if [ -f "$sentinel" ]; then
    current_version=$(cat "$sentinel" 2>/dev/null || echo "")
  fi

  local reseed_reason=""
  if [ ! -f "$WORKSPACE/start.sh" ]; then
    reseed_reason="start.sh missing"
  elif [ -z "$non_runtime_content" ]; then
    reseed_reason="workspace empty"
  elif [ "$template_version" != "$current_version" ]; then
    reseed_reason="template updated"
  fi

  if [ -n "$reseed_reason" ]; then
    log "Seeding workspace at $WORKSPACE ($reseed_reason)"
    rsync -a "$TEMPLATE_ROOT"/ "$WORKSPACE"/
  fi

  # Ensure new helper scripts exist even if workspace was seeded previously
  if [ ! -f "$WORKSPACE/start-prebuilt.sh" ] && [ -f "$TEMPLATE_ROOT/start-prebuilt.sh" ]; then
    log "Adding missing start-prebuilt.sh to workspace"
    cp "$TEMPLATE_ROOT/start-prebuilt.sh" "$WORKSPACE/start-prebuilt.sh"
    chown "$SSH_USER:$SSH_USER" "$WORKSPACE/start-prebuilt.sh" 2>/dev/null || true
    chmod +x "$WORKSPACE/start-prebuilt.sh" 2>/dev/null || true
  fi

  if [ ! -f "$WORKSPACE/source/scripts/start-prebuilt.sh" ] && \
     [ -f "$TEMPLATE_ROOT/source/scripts/start-prebuilt.sh" ]; then
    log "Adding missing source/scripts/start-prebuilt.sh to workspace"
    mkdir -p "$WORKSPACE/source/scripts"
    cp "$TEMPLATE_ROOT/source/scripts/start-prebuilt.sh" \
       "$WORKSPACE/source/scripts/start-prebuilt.sh"
    chown "$SSH_USER:$SSH_USER" "$WORKSPACE/source/scripts/start-prebuilt.sh" 2>/dev/null || true
    chmod +x "$WORKSPACE/source/scripts/start-prebuilt.sh" 2>/dev/null || true
  fi

  printf '%s\n' "$template_version" > "$sentinel"
  chown "$SSH_USER:$SSH_USER" "$sentinel" 2>/dev/null || true

  chown -R "$SSH_USER:$SSH_USER" "$WORKSPACE" 2>/dev/null || true
  find "$WORKSPACE" -type f -name '*.sh' -exec chmod +x {} + || true

  ln -sf "$WORKSPACE/start.sh" /usr/local/bin/start.sh || true
  ln -sf "$WORKSPACE/start-prebuilt.sh" /usr/local/bin/start-prebuilt.sh || true
}

sync_workspace_from_git() {
  local repo_dir="$WORKSPACE"

  if [ ! -d "$repo_dir/.git" ]; then
    log "No git repository found in $repo_dir; skipping git sync"
    return
  fi

  local target_ref="origin/main"

  log "Syncing workspace with git ($target_ref)"

  if ! su - "$SSH_USER" -c "git config --global --add safe.directory '$repo_dir'" >/dev/null 2>&1; then
    log "Warning: unable to update git safe.directory for $repo_dir"
  fi

  local current_ref
  current_ref=$(su - "$SSH_USER" -c "cd '$repo_dir' && git rev-parse HEAD" 2>/dev/null || echo "")

  if su - "$SSH_USER" -c "cd '$repo_dir' && git fetch --tags origin"; then
    local desired_ref
    desired_ref=$(su - "$SSH_USER" -c "cd '$repo_dir' && git rev-parse '$target_ref'" 2>/dev/null || echo "")

    if [ -z "$desired_ref" ]; then
      log "Warning: unable to resolve $target_ref after fetch; keeping existing workspace"
      return
    fi

    if [ -n "$current_ref" ] && [ "$current_ref" = "$desired_ref" ]; then
      log "Workspace already at $desired_ref; no reset needed"
      return
    fi

    if ! su - "$SSH_USER" -c "cd '$repo_dir' && git reset --hard '$desired_ref'"; then
      log "Warning: git reset to $desired_ref failed; continuing with existing workspace"
    fi
  else
    log "Warning: git fetch failed; workspace left as-is"
  fi
}

prepare_ssh() {
  mkdir -p /var/run/sshd
  if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    log "Generating SSH host keys"
    ssh-keygen -A >/dev/null 2>&1
  fi

  mkdir -p "$SSH_HOME/.ssh"
  chmod 700 "$SSH_HOME/.ssh"

  if [ -n "$AUTHORIZED_KEYS_VALUE" ]; then
    log "Installing authorized SSH keys for $SSH_USER"
    printf '%s\n' "$AUTHORIZED_KEYS_VALUE" > "$SSH_HOME/.ssh/authorized_keys"
    chmod 600 "$SSH_HOME/.ssh/authorized_keys"
  fi

  chown -R "$SSH_USER:$SSH_USER" "$SSH_HOME/.ssh"

  if ! pgrep -x sshd >/dev/null 2>&1; then
    log "Starting sshd"
    /usr/sbin/sshd
  fi
}

configure_password_login() {
  if [ "${SSH_ENABLE_PASSWORD,,}" = "true" ]; then
    log "Configuring password authentication for user $SSH_USER"
    if grep -qE '^PasswordAuthentication\s' /etc/ssh/sshd_config; then
      sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
    else
      echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config
    fi
    echo "$SSH_USER:$SSH_PASSWORD" | chpasswd
  else
    log "Disabling SSH password authentication"
    if grep -qE '^PasswordAuthentication\s' /etc/ssh/sshd_config; then
      sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    else
      echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
    fi
  fi
}

prepare_data_dirs() {
  mkdir -p \
    "$NEO4J_DATA_ROOT"/data \
    "$NEO4J_DATA_ROOT"/logs \
    "$NEO4J_DATA_ROOT"/plugins \
    "$NEO4J_DATA_ROOT"/licenses \
    "$NEO4J_DATA_ROOT"/import \
    "$NEO4J_DATA_ROOT"/run

  if [ ! -d "$NEO4J_HOME" ]; then
    mkdir -p "$NEO4J_HOME" 2>/dev/null || true
  fi

  mkdir -p "$REDIS_DATA_ROOT"

  if id -u neo4j >/dev/null 2>&1; then
    log "Ensuring Neo4j directories are owned by neo4j"
    chown -R neo4j:neo4j "$NEO4J_DATA_ROOT" 2>/dev/null || true
    chown -R neo4j:neo4j /var/lib/neo4j 2>/dev/null || true
    chown -R neo4j:neo4j /var/log/neo4j 2>/dev/null || true
  else
    log "Warning: neo4j user not found; skipping ownership fix"
  fi

  chown -R "$SSH_USER:$SSH_USER" "$REDIS_DATA_ROOT"

  if [ -d "$NEO4J_HOME" ]; then
    for dir in data logs plugins licenses import run; do
      target="$NEO4J_DATA_ROOT/$dir"
      link="$NEO4J_HOME/$dir"
      if [ ! -L "$link" ]; then
        rm -rf "$link"
        ln -s "$target" "$link" || true
      fi
    done
  else
    log "Warning: Neo4j home $NEO4J_HOME is missing; skipping symlink setup"
  fi
}

initialize_neo4j_password() {
  local auth_file="$NEO4J_DATA_ROOT/data/dbms/auth"
  if id -u neo4j >/dev/null 2>&1 && [ -n "${NEO4J_PASSWORD:-}" ]; then
    if [ ! -s "$auth_file" ]; then
      log "Setting initial Neo4j password"
      if su -s /bin/sh neo4j -c "neo4j-admin dbms set-initial-password '$NEO4J_PASSWORD'"; then
        log "Initial Neo4j password applied"
      else
        log "Warning: unable to set initial Neo4j password"
      fi
    fi
  fi
}

set_https_capability() {
  local gateway_bin="$WORKSPACE/bin/kalisi-gateway"
  if command -v setcap >/dev/null 2>&1 && [ -f "$gateway_bin" ]; then
    if setcap 'cap_net_bind_service=+ep' "$gateway_bin" >/dev/null 2>&1; then
      log "Applied cap_net_bind_service to kalisi-gateway"
    else
      log "Warning: unable to set HTTPS capability on kalisi-gateway"
    fi
  fi
}

start_ttyd() {
  if command -v ttyd >/dev/null 2>&1; then
    if ! pgrep -x ttyd >/dev/null 2>&1; then
      log "Starting ttyd web terminal on port 7681"
      # Check if custom index exists, otherwise use default
      if [ -f "/workspace/ttyd-custom-index.html" ]; then
        ttyd -W -p 7681 -I /workspace/ttyd-custom-index.html sudo -u kalisi bash >/dev/null 2>&1 &
      else
        ttyd -W -p 7681 sudo -u kalisi bash >/dev/null 2>&1 &
      fi

      # Give ttyd a moment to start
      sleep 2

      # Verify it started successfully
      if pgrep -x ttyd >/dev/null 2>&1; then
        log "ttyd started successfully"
      else
        log "Warning: ttyd failed to start"
      fi
    fi
  fi
}

babysit_container() {
  log "Babysitter active; awaiting stop signal"
  local keep_running=true
  trap 'keep_running=false' TERM INT
  while $keep_running; do
    sleep 3600 &
    wait $! || true
  done
  log "Babysitter shutting down"
}

ensure_workspace
sync_workspace_from_git
prepare_data_dirs
set_https_capability
prepare_ssh
configure_password_login
initialize_neo4j_password
start_ttyd

if [[ "${KALISI_AUTO_START:-false}" == "true" ]]; then
  log "Auto-start enabled; launching prebuilt runtime"
  set +e
  su - "$SSH_USER" -c "export DOCKER_CONTAINER=true; cd '$WORKSPACE' && ./start-prebuilt.sh"
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    log "start-prebuilt.sh exited with status $status"
  fi

  # Wait for services to be ready
  log "Waiting for services to be ready..."
  for i in {1..60}; do
    # Check if HTTPS gateway is responding
    if curl -k -s --connect-timeout 2 https://localhost:8443 >/dev/null 2>&1; then
      log "Services are ready"
      break
    fi
    sleep 2
  done

  babysit_container
  exit 0
fi

exec "$@"
