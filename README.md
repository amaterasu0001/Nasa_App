# A.V.I.A. — Autonomous Vital Intelligence Agent

Offline-first, AI-driven crew health monitoring for long-duration spaceflight (NASA Space Apps 2026).

## Repository layout

| Folder | What | Stack |
| --- | --- | --- |
| [client-cockpit/](client-cockpit/) | Desktop control center: dashboard + 3D digital twin | React, Vite, React Three Fiber |
| [client-pulse/](client-pulse/) | Edge interface for wearable / handheld | React, Vite |
| [bff/](bff/) | Backend-for-Frontend: the only API the clients call. Aggregates and caches. | Fastify, Node.js, Redis |
| [server/](server/) | Core API: owns the data, enforces Row Level Security | Fastify, Node.js, PostgreSQL |
| [ml/](ml/) | LSTM / NLP model training and TFLite export | Python |
| [agent/](agent/) | Biometric & psychological agents | Python |
| [docker/](docker/) | Container config (Postgres init + RLS schema) | Docker |
| [doc/](doc/) | Architecture and project docs | — |

```
client-cockpit ─┐
                ├─► bff (Fastify) ──► server (Fastify) ──► PostgreSQL (RLS)
client-pulse  ──┘        │
                         └──► Redis (cache)
```

See [doc/architecture.md](doc/architecture.md) for details.

## Quick start: everything in Docker

```bash
cp .env.example .env      # optional, all values have dev defaults
docker compose up -d --build
```

| Service | URL |
| --- | --- |
| Cockpit | http://localhost:8080 |
| Pulse | http://localhost:8081 |
| BFF | http://localhost:4000/health |
| Core API | http://localhost:3000/health |

## Local development: hot reload

Run Postgres and Redis in Docker, and the apps on your machine:

```bash
npm run infra:up          # postgres + redis only
npm run install:all

npm run dev:server        # :3000
npm run dev:bff           # :4000
npm run dev:cockpit       # :5173
npm run dev:pulse         # :5174
```

The Vite dev servers proxy `/bff/*` to `localhost:4000`.

## Resetting the database

The schema in [docker/postgres/init/](docker/postgres/init/) only runs on an empty volume:

```bash
docker compose down -v && docker compose up -d
```
