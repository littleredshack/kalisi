# Kalisi All-In-One Container

This repo now produces a single Docker image that bundles the Kalisi application, Neo4j, Redis, and an SSH endpoint. The container is designed for collaborative development: you (and anyone who pulls the image) can SSH in, edit the code, rebuild with `./start.sh --build`, and immediately test changes over HTTPS.

## What's Inside

- **Kalisi services** – `kalisi-gateway`, `agent-runtime-service`, and `neo4j-ui` binaries prebuilt in the image.
- **Datastores** – Neo4j Community 5.x and Redis running inside the same container.
- **Developer tooling** – Rust nightly toolchain, Node 20, npm, git, and common CLI utilities so you can rebuild from source in-place.
- **SSH access** – log in as the `kalisi` user to edit code, run tests, commit, and push.
- **Persistent volumes** – `/workspace`, `/data/neo4j`, and `/data/redis` are backed by Docker named volumes so code changes, graph data, and Redis state survive container restarts.

Only two ports are published by default: `8443` (Kalisi HTTPS) and `2222` (SSH).

## Prerequisites

- Docker Desktop 4.19+ (or Docker Engine with Compose v2).
- An SSH public key to authorize container access.

## 1. Build or Pull the Image

```bash
# Rebuild the image from source (optional; otherwise the last built image is reused)
./scripts/kalisi-start.sh --build
```

The helper script still accepts `--authorized-keys` and `--auto-start`; see below.

## 2. Launch the Container

```bash
# Inject your SSH key and start the container detached
./scripts/kalisi-start.sh --authorized-keys ~/.ssh/id_ed25519.pub
# (If you omit the flag, the script tries ~/.ssh/id_ed25519.pub then ~/.ssh/id_rsa.pub automatically.)
```

- The command seeds `/workspace` with this repository (including `.git`) on first run.
- SSH host keys and your `authorized_keys` entry are created automatically.
- Services are *not* started yet; the container idles so you can rebuild before launching.

To make the services boot immediately, add `--auto-start` (or set `KALISI_AUTO_START=true`).

Stop everything at any time:

```bash
./scripts/kalisi-stop.sh
```

## 3. Develop Inside the Container

```bash
# Connect over SSH (default passwordless key auth)
ssh -p 2222 kalisi@localhost

# Inside the container
cd /workspace
./start.sh --build    # rebuild binaries + frontend then start Redis, Neo4j, Kalisi
# or: ./start.sh       # reuse the existing binaries and assets
```

Configure your git identity once so commits from the container are properly attributed:

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

Key folders:

- `/workspace` – full repo checkout for editing and committing.
- `/workspace/bin` – runtime binaries used by `start.sh`.
- `/workspace/runtime` – contains `.env`, TLS certs, config, and frontend dist served by Kalisi.
- `/data/neo4j` and `/data/redis` – datastore state (remove the volumes to reset).

Once `start.sh` reports that all services are running, browse `https://localhost:8443` (accept the self-signed certificate). Only HTTPS is exposed externally; HTTP and Neo4j bolt/http stay inside the container.

## Rebuilding & Iterating

- Edit code under `/workspace/source` (Rust) or `/workspace/source/frontend` (frontend).
- Run `./start.sh --build` to rebuild + restart. The script rebuilds Rust services, refreshes the frontend bundle, seeds Neo4j if a dump is present, and launches Redis/Neo4j/Kalisi with the correct environment variables.
- Logs stream to your shell; stop the stack with `Ctrl+C` or `./scripts/kalisi-stop.sh` from the host.
- Use regular `git` commands inside `/workspace` to inspect, commit, and push to your GitHub remote.

## Publishing to GitHub Container Registry (GHCR)

1. Ensure the container is stopped (`./scripts/kalisi-stop.sh`) so binaries and dist are up to date in `/workspace`.
2. Build/tag the unified image:
   ```bash
   docker compose build kalisi
   docker tag kalisi/all-in-one:latest ghcr.io/<org>/<repo>:<tag>
   ```
3. Push to GHCR:
   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <username> --password-stdin
   docker push ghcr.io/<org>/<repo>:<tag>
   ```
4. Share the image reference. Anyone can `docker pull ghcr.io/<org>/<repo>:<tag>` and `docker compose up -d` with this repo to get the same environment (including SSH + browser workflow).

## Environment & Configuration

- `AUTHORIZED_KEYS` – newline-delimited SSH public keys added to `/home/kalisi/.ssh/authorized_keys`.
- `SSH_PASSWORD` – password for the `kalisi` user if password auth is enabled (default value `kalisi`). Password logins are **off** by default; set `SSH_ENABLE_PASSWORD=true` to turn them on.
- `NEO4J_PASSWORD`, `JWT_SECRET`, `APPROVED_EMAILS`, etc. can be set via `docker compose` environment variables to override defaults written into `/workspace/runtime/.env`.
- `KALISI_AUTO_START=true` – automatically run `./start.sh --foreground` when the container launches.
- `seed/neo4j.dump` – if present, it will be restored exactly once into the Neo4j data volume on the first run.
- TLS certificates are auto-created: if `/workspace/runtime/certs` lacks `server.crt`/`server.key`, `./start.sh` regenerates a self-signed pair (and reuses them on subsequent runs).

Adjust these by editing `docker-compose.yml`, setting env vars before `docker compose up`, or using the helper script flags.

## Resetting State

To wipe code or data, remove the named volumes:

```bash
docker compose down -v            # removes all volumes (workspace + data)
# or individually
docker volume rm kalisi-workspace kalisi-neo4j kalisi-redis
```

After recreating the container, `/workspace` will be reseeded from the image template.

## File Map

- `docker/Dockerfile` – builds the unified image (Rust + Node build stages, runtime with Neo4j/Redis/SSH tooling).
- `docker/entrypoint.sh` – seeds the workspace volume, prepares data directories, starts `sshd`, and optionally auto-starts Kalisi.
- `start.sh` – container-side orchestrator to rebuild and launch Redis, Neo4j, and the Kalisi services.
- `docker-compose.yml` – single-service definition exposing HTTPS and SSH with persistent volumes.
- `scripts/kalisi-start.sh` / `scripts/kalisi-stop.sh` – host-side helpers to build, run, and stop the container.

With this layout the Docker footprint matches the "single VM" setup you described: SSH in, edit, rebuild, test over HTTPS, commit, push, and publish the image for others to repeat the same workflow.
