# Claw-Empire Docker Cutover Runbook (2026-02-22)

## Goal
Run Claw-Empire in Docker while keeping the current environment behavior unchanged:

- Same public URL: `https://instance-20260215-2310.taildf6401.ts.net/claw-empire/`
- Same host listen endpoint expected by Tailnet router: `127.0.0.1:8790`
- Same runtime data paths under `/mnt/sdb/opc-data/claw-empire-runtime`

## Why this works
Current Tailnet routing already points `/claw-empire` to `127.0.0.1:8790`.
Docker keeps this contract by publishing container port `8790` to host loopback `127.0.0.1:8790`.

## Files
- `Dockerfile`
- `.dockerignore`
- `infra/docker/docker-compose.yml`

## 0) Pre-check
```bash
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire

git rev-parse --short HEAD
# expected: 2bca327 (or newer)

curl -sS http://127.0.0.1:8790/api/health
# before cutover this may show old service version
```

## 1) Canary test on port 8791 (no downtime)
```bash
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire

CLAW_EMPIRE_HOST_PORT=8791 CLAW_EMPIRE_DB_PATH=/runtime/db/claw-empire-canary.sqlite docker compose -f infra/docker/docker-compose.yml up -d --build
curl -sS http://127.0.0.1:8791/api/health

# canary 종료
docker compose -f infra/docker/docker-compose.yml down
```

Expected health response version: `1.1.4`.

## 2) Cutover to port 8790
```bash
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire

sudo systemctl stop claw-empire.service
sudo systemctl disable claw-empire.service

CLAW_EMPIRE_HOST_PORT=8790 docker compose -f infra/docker/docker-compose.yml up -d --build

curl -sS http://127.0.0.1:8790/api/health
```

## 3) Tailnet path verification
```bash
curl -sS http://127.0.0.1:8088/claw-empire/api/health
```

If this returns `1.1.4`, external Tailnet URL should also serve the same backend.

## 4) Operations commands
```bash
# logs
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire
docker compose -f infra/docker/docker-compose.yml logs -f claw-empire

# restart after git pull
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire
git pull --ff-only
CLAW_EMPIRE_HOST_PORT=8790 docker compose -f infra/docker/docker-compose.yml up -d --build

# stop
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire
docker compose -f infra/docker/docker-compose.yml down
```

## Rollback
```bash
cd /mnt/sdb/opc-data/codex-sandbox/claw-empire
docker compose -f infra/docker/docker-compose.yml down

sudo systemctl enable --now claw-empire.service
curl -sS http://127.0.0.1:8790/api/health
```
