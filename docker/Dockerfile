# syntax=docker/dockerfile:1.6

ARG NEO4J_VERSION=5.15.0
ARG NODE_MAJOR=20

########################################
# Rust builder
########################################
FROM rust:slim AS rust-builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libssl-dev \
        git \
    && rm -rf /var/lib/apt/lists/*

RUN rustup toolchain install nightly --profile minimal \
    && rustup default nightly

COPY source/Cargo.toml source/Cargo.lock ./
COPY source/crates ./crates
COPY source/codebase-analyzer ./codebase-analyzer
COPY source/services ./services
COPY source/neo4rs-glen-custom ./neo4rs-glen-custom

RUN cargo +nightly fetch

COPY source/ ./
RUN rm -f .cargo/config.toml

RUN cargo +nightly build --release \
    --package kalisi-gateway \
    --package agent-runtime \
    --package neo4j-ui

########################################
# Frontend builder
########################################
FROM node:20 AS frontend-builder

WORKDIR /frontend

COPY source/frontend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY source/frontend ./
RUN npm run build

########################################
# Unified runtime image
########################################
FROM ubuntu:24.04

ARG NEO4J_VERSION
ARG NODE_MAJOR

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        tzdata \
        libssl3 \
        build-essential \
        pkg-config \
        libssl-dev \
        git \
        clang \
        openssh-server \
        sudo \
        vim \
        nano \
        less \
        unzip \
        rsync \
        ripgrep \
        redis-server \
        openjdk-17-jre-headless \
        python3 \
        python3-pip \
        python-is-python3 \
        python3.12-venv \
        wget \
        gnupg \
        jq \
        lsof \
        netcat-openbsd \
        net-tools \
        procps \
        tini \
        mold \
        sccache \
        libcap2-bin \
        xdg-utils \
        lynx \
        wslu \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g npm@11.6.1 \
    && npm install -g @anthropic-ai/claude-code \
    && pip install --no-cache-dir --break-system-packages neo4j \
    && wget -O - https://debian.neo4j.com/neotechnology.gpg.key | gpg --dearmor -o /usr/share/keyrings/neo4j.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/neo4j.gpg] https://debian.neo4j.com stable latest' > /etc/apt/sources.list.d/neo4j.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
         neo4j \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && TTYD_VERSION=$(curl -s https://api.github.com/repos/tsl0922/ttyd/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/') \
    && wget -O /tmp/ttyd.tar.gz "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" \
    && mv /tmp/ttyd.x86_64 /usr/local/bin/ttyd || wget -O /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" \
    && chmod +x /usr/local/bin/ttyd \
    && rm -rf /var/lib/apt/lists/*

RUN rm -rf /opt/neo4j \
    && ln -s /usr/share/neo4j /opt/neo4j

COPY config/neo4j/neo4j.conf /etc/neo4j/neo4j.conf

# Install APOC plugin for Neo4j 2025.09.0
RUN curl -L https://github.com/neo4j/apoc/releases/download/2025.09.0/apoc-2025.09.0-core.jar \
    -o /var/lib/neo4j/plugins/apoc-2025.09.0-core.jar \
    && chown neo4j:neo4j /var/lib/neo4j/plugins/apoc-2025.09.0-core.jar

RUN useradd --create-home --shell /bin/bash kalisi \
    && mkdir -p /home/kalisi/.ssh \
    && chmod 700 /home/kalisi/.ssh \
    && echo "kalisi ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/kalisi \
    && chmod 440 /etc/sudoers.d/kalisi \
    && echo "cd /workspace/source 2>/dev/null || true" >> /home/kalisi/.bashrc

ENV RUSTUP_HOME=/home/kalisi/.rustup \
    CARGO_HOME=/home/kalisi/.cargo \
    WORKSPACE_ROOT=/workspace \
    KALISI_RUNTIME_DIR=/workspace/runtime \
    KALISI_BIN_DIR=/workspace/bin \
    NEO4J_HOME=/opt/neo4j \
    NEO4J_CONF=/opt/neo4j/conf \
    NEO4J_ACCEPT_LICENSE_AGREEMENT=yes \
    PATH=/home/kalisi/.cargo/bin:/workspace/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN mkdir -p /workspace /data/neo4j /data/redis /opt/bootstrap \
    && chown -R kalisi:kalisi /workspace /data/redis /opt/bootstrap \
    && chown -h kalisi:kalisi /opt/neo4j

USER kalisi
WORKDIR /home/kalisi

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain nightly --profile minimal \
    && rustup component add --toolchain nightly rustfmt clippy

USER root
WORKDIR /

# Prepare workspace template with source code and prebuilt assets
COPY --chown=kalisi:kalisi . /opt/bootstrap/workspace-template

RUN mkdir -p /opt/bootstrap/workspace-template/bin \
    /opt/bootstrap/workspace-template/runtime/frontend/dist \
    /opt/bootstrap/workspace-template/runtime/certs \
    /opt/bootstrap/workspace-template/runtime/config

# Copy custom ttyd index and favicon to workspace template
COPY ttyd-custom-index.html /opt/bootstrap/workspace-template/ttyd-custom-index.html
COPY favicon.ico /opt/bootstrap/workspace-template/favicon.ico

COPY --from=rust-builder --chown=kalisi:kalisi /app/target/release /opt/bootstrap/workspace-template/source/target/release
RUN ln -sf ../source/target/release/kalisi-gateway /opt/bootstrap/workspace-template/bin/kalisi-gateway \
  && ln -sf ../source/target/release/agent-runtime-service /opt/bootstrap/workspace-template/bin/agent-runtime-service \
  && ln -sf ../source/target/release/neo4j-ui /opt/bootstrap/workspace-template/bin/neo4j-ui

COPY --from=frontend-builder --chown=kalisi:kalisi /frontend/dist/ /opt/bootstrap/workspace-template/runtime/frontend/dist/

# Default config and certs for runtime
RUN if [ -d /opt/bootstrap/workspace-template/config ]; then \
      rsync -a /opt/bootstrap/workspace-template/config/ /opt/bootstrap/workspace-template/runtime/config/; \
    fi && \
    if [ -d /opt/bootstrap/workspace-template/source/certs ]; then \
      rsync -a /opt/bootstrap/workspace-template/source/certs/ /opt/bootstrap/workspace-template/runtime/certs/; \
    fi

# Entry point and helper scripts
COPY docker/entrypoint.sh /usr/local/bin/container-entrypoint
RUN chmod +x /usr/local/bin/container-entrypoint

EXPOSE 22 8443

VOLUME ["/workspace", "/data/neo4j", "/data/redis"]

# Health check to verify all services are running
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -k -f https://localhost:8443 >/dev/null 2>&1 && \
      curl -f http://localhost:7474 >/dev/null 2>&1 && \
      curl -f http://localhost:7681 >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/container-entrypoint"]
CMD ["sleep", "infinity"]
