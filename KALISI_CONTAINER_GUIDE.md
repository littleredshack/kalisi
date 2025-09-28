# Kalisi Container Workflow Guide

## High-Level Layout
- **docker/** – Dockerfile and entrypoint scripts used to build the all-in-one image.
- **docker-compose.yml** – Declares the `kalisi` service, named volumes, localhost-only port mappings, and host bind-mounts (Neo4j config plus the shared `.env`).
- **scripts/** – Helper CLIs such as `kalisi-start.sh` (build/start) and `kalisi-stop.sh` (shutdown wrapper).
- **config/** – Host-side configuration overrides that are mounted into the container (e.g. `config/neo4j/neo4j.conf`).
- **seed/** – Optional import artifacts (Neo4j dumps/JSON) you can load manually.
- **source/** – Full Kalisi application repo (Rust services, frontend, tooling). This is a live clone of `https://github.com/littleredshack/kalisi.git`; keep it current with `git fetch && git reset --hard origin/main`. The `source/.env` file is the single source of truth for runtime settings and is bind-mounted directly into the container.

On first boot the container seeds `/workspace` from `/opt/bootstrap/workspace-template` (baked during the image build). Subsequent boots reuse the persisted volumes under `/workspace`, `/data/neo4j`, `/data/redis`, and `/home/kalisi`.

## Network Exposure
- HTTPS (`kalisi-gateway`) and SSH are published only on the loopback interface:
  - `127.0.0.1:8443 → 8443`
  - `127.0.0.1:2222 → 22`
- Internal services (Neo4j bolt/HTTP, Redis) are not exposed; reach them via `docker exec` or SSH port forwarding if required.
- To expose services beyond localhost, adjust the `ports` entries in `docker-compose.yml`, but the default configuration keeps the container accessible only from the host machine.

## Image Build Pipeline
- The multi-stage `docker/Dockerfile` builds Rust services (`kalisi-gateway`, `agent-runtime-service`, `neo4j-ui`) and the frontend bundle, then assembles them into a final Ubuntu 24.04 image.
- System dependencies baked in: Rust nightly toolchain, Node 20, Redis, Neo4j, `gh`, `jq`, `lsof`, `net-tools`, Python 3, build tools, etc.
- The final stage installs binaries/configs under `/opt/bootstrap/workspace-template`, sets up the `kalisi` user, and prepares runtime directories (`/workspace`, `/data/neo4j`, `/data/redis`).
- Persistent storage is handled by Docker volumes declared in `docker-compose.yml`:
  - `kalisi-workspace` → `/workspace`
  - `kalisi-neo4j` → `/data/neo4j`
  - `kalisi-redis`  → `/data/redis`
  - `kalisi-home`   → `/home/kalisi`
  - Bind-mount `./config/neo4j/neo4j.conf` → `/etc/neo4j/neo4j.conf`
  - Bind-mount `./source/.env` → `/workspace/runtime/.env`
- Rebuild via `scripts/kalisi-start.sh --build` (or `docker compose build kalisi`). Tag/push the resulting image to GHCR with `docker tag ... ghcr.io/littleredshack/kalisi:latest && docker push ...`.

## Startup Flow
### Host Wrapper (`scripts/kalisi-start.sh`)
- Usage: `scripts/kalisi-start.sh [--build] [--no-auto-start] [--keys-from <path>] [--authorized-keys <keys>]`.
- Defaults: no rebuild, auto-start enabled, SSH key inferred from `~/.ssh/id_ed25519.pub` or `id_rsa.pub`.
- Exports `AUTHORIZED_KEYS` and `KALISI_AUTO_START`, then runs `docker compose up -d kalisi`.

### Container Entrypoint (`docker/entrypoint.sh`)
1. Seeds `/workspace` on first launch, ensures Neo4j/Redis directories, applies HTTPS capability to `kalisi-gateway`, and configures SSH.
2. If `KALISI_AUTO_START=true`, runs `./start.sh --daemon` as user `kalisi`. The script’s exit status is logged.
3. A babysitter loop (PID 1) keeps the container alive until it receives `TERM`/`INT`.
4. Without auto-start, the entrypoint execs the default command (`sleep infinity`).

### Stop Script (`scripts/kalisi-stop.sh`)
- Wrapper for `docker compose down`. Leaves named volumes intact; use `docker compose down --volumes` only if you intentionally want to wipe persisted data.

## `start.sh` Responsibilities
- Detects container mode, sources Rust environment, and verifies toolchain versions.
- Ensures runtime configuration: loads the bind-mounted `runtime/.env` (from `source/.env`) and exits if it is missing; copies defaults/certs, generates self-signed certs when necessary.
- Builds Rust services and the frontend when sources change; installs artifacts into `bin/` and `runtime/frontend/dist`.
- Orchestrates runtime services:
  - Starts Redis and Neo4j (fixing ownership under `/data/neo4j` when needed).
  - Applies `cap_net_bind_service` to the gateway binary when binding to privileged ports.
  - Stops any existing `kalisi-gateway` process only, then relaunches the gateway, agent runtime, and Neo4j UI.
  - In `--daemon` mode (triggered by PID 1) the script backgrounds services and returns so the babysitter keeps the container running. Manual invocation rebuilds/restarts while keeping your shell in the foreground.

## Data & Configuration Persistence
- **Neo4j**: Stored entirely on the `kalisi-neo4j` volume (`/data/neo4j`). `config/neo4j/neo4j.conf` overrides directories so Neo4j writes under that path. Password changes via `ALTER USER neo4j SET PASSWORD ...` persist unless the volume is removed. Update `runtime/.env` (or compose env) with the matching `NEO4J_PASSWORD` for the app to reconnect.
- **Redis**: Data lives on `kalisi-redis` (`/data/redis`).
- **Workspace**: `/workspace` (including `runtime/`, `bin/`, your edits) persists through `kalisi-workspace`. `runtime/.env` is a read-only bind of `source/.env`, so update configuration in the repository and restart the stack to apply changes.
- **Home directory**: `/home/kalisi` persists (VS Code server, SSH config) via `kalisi-home`.
- Avoid running `docker compose down --volumes` or `docker system prune --volumes` unless you plan to wipe data.

## Source Code & Git Workflow
- `source/` is a clone of `https://github.com/littleredshack/kalisi.git`. Keep it current: `cd source && git fetch origin && git reset --hard origin/main`.
- Inside the container, run `git config --global --add safe.directory /workspace/source`, then `git pull`, develop, commit, and push as usual.
- To make sure builds use the latest code, sync `source/` before running `scripts/kalisi-start.sh --build`.

## Demo Credentials & API Keys
All secrets for the demo environment live in `source/.env` and are bind-mounted into the container. Current values:

| Purpose | Variable | Value |
| --- | --- | --- |
| JWT signing | `JWT_SECRET` | `Hliw4fUOML37cy03IquVSSiV4w3gsdYA0Ft4ykyn3oVkL9u6665xyzQPnhvScsRKZCkf/jYI11aLI8x1aPpVQA==` |
| Field encryption | `ENCRYPTION_KEY` | `563a11e8249639f185e6e4736bf20aa0bd1471c8f31a918aa43cd21e89a7c817` |
| Neo4j admin | `NEO4J_PASSWORD` | `kalisi-neo4j` |
| Redis URL | `REDIS_URL` | `redis://localhost:6379` |
| Test user password | `TEST_PASSWORD` | `your_secure_test_password` |
| Test Neo4j password | `TEST_NEO4J_PASSWORD` | `your_neo4j_password_here` |
| Claude API | `CLAUDE_API_KEY` | `sk-ant-api03-your_claude_api_key_here` |
| Resend API | `RESEND_API_KEY` | `re_your_resend_api_key_here` |
| Field encryption (tests) | `FIELD_ENCRYPTION_KEY` | `your_base64_encoded_field_encryption_key` |

SSH access is key-only: the container user `kalisi` has no password; keys are injected via `scripts/kalisi-start.sh` (defaults to `~/.ssh/id_rsa.pub` unless overridden).

## Build → Push → Run Checklist
1. Sync `source/` with the latest upstream commits.
2. Modify code/config as needed.
3. Rebuild: `scripts/kalisi-start.sh --build` (include key flags if necessary).
4. Optionally push the image: `docker tag kalisi/all-in-one:latest ghcr.io/littleredshack/kalisi:latest && docker push ghcr.io/littleredshack/kalisi:latest`.
5. Run the stack: `scripts/kalisi-start.sh` (default auto-start, SSH keys auto-detected).
6. Stop when done: `scripts/kalisi-stop.sh`.

Following this structure ensures the container always uses up-to-date source, services auto-start reliably, and data persists across rebuilds and restarts.
