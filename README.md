# Upstream Monitoring System

A self-hosted network monitoring platform that watches the routes, latency and reachability of major internet services, datacenters, CDNs, IXPs and utilities from your own vantage point.

- **Traces** every monitored destination (ping + ICMP traceroute) on a schedule — default every 6 hours — and **detects route, IP, AS-path and latency changes** between consecutive reports.
- **Samples latency** with a 10-packet ping **every 5 minutes** per destination, graphing min / max / avg on each destination page and driving the global "network health" metric.
- **Attributes** every destination and each hop with its **AS number, company name, country, prefix and registry** from Regional Internet Registries (ARIN / RIPE / APNIC / LACNIC / AFRINIC), resolved live via team-cymru + RDAP.
- Ships with **period availability & latency reports** (daily … yearly), a **global search**, **light/dark themes**, an **admin panel**, and per-destination **history** pages.
- Includes a **Settings page** for changing the admin password, tuning every monitoring parameter and setting data retention — all at runtime without redeploying.
- Includes **bulk destination import** from an Excel (XLSX) or CSV file, with a downloadable sample template.
- Deployed with **Docker Compose** on a single VPS.

Built with the **PERN + TypeScript stack** (PostgreSQL `18-alpine`, Express, React, Node.js) using **Prisma** for the data layer.

---

## Table of contents

- [How it works](#how-it-works)
- [Change detection](#change-detection)
- [RIR ASN / company attribution](#rir-asn--company-attribution)
- [Monitored destinations](#monitored-destinations)
- [Features](#features)
- [Settings](#settings)
- [Bulk destination import](#bulk-destination-import)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Docker deployment](#docker-deployment)
- [First run](#first-run)
- [Local development](#local-development)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Admin panel & authentication](#admin-panel--authentication)
- [Data retention](#data-retention)
- [Security & operations notes](#security--operations-notes)
- [Database migrations](#database-migrations)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## How it works

1. A **trace scheduler** (default cron `0 */6 * * *`, every 6 hours) runs an **ICMP traceroute** (`traceroute -I`) plus a 10-packet ping against every enabled destination.
2. A **ping loop** (default cron `*/5 * * * *`) records a `PingSample` (min / max / avg latency + packet loss) per destination for the latency graphs and the network-health metric.
3. Each trace run produces a `TraceReport` (packet loss, RTT stats, hop-by-hop path with per-hop IP / ASN / company, path fingerprint).
4. The **comparator** diffs each new report against the previous report *for the same destination* and writes any detected change to a `ChangeEvent` with a severity and a structured old → new diff.
5. Change events appear in the UI (Changes page) where they can be acknowledged; every destination page keeps a hop-by-hop history.

The whole pipeline is orchestrated by `backend/src/services/orchestrator.ts`; schedules are managed by `backend/src/services/scheduler.ts`.

## Change detection

| Detected change | Severity | Example |
| --- | --- | --- |
| **AS-path change** | **critical** | the same hop's ASN changed vs the previous trace (`AS3356 → AS2914`) — most vital signal |
| Reachability | critical | destination became unreachable / recovered |
| Packet loss | critical | loss % moved between reports |
| Path change | warning | hop IP sequence differs between runs |
| Hop added / removed | warning | new router appeared, or one vanished |
| Hop IP change | warning | a specific TTL now resolves to a different IP |
| RTT shift | warning / info | average RTT moved by ≥ threshold (default 30%) |

> **AS-path change is only flagged when the *same hop* (TTL) changed ASN vs the previous trace and both ASNs are known.** Packets normally crossing from one AS to another across different hops is not a change — only a same-hop ASN change (i.e. a route change) is marked critical.

RTT-shift and packet-loss thresholds are configurable from **Settings** (see [below](#settings)).

## RIR ASN / company attribution

For every destination IP (and every trace hop IP) the backend queries:

- **team-cymru `whois.cymru.com`** origin-ASN service — ASN, BGP prefix, country, registry.
- **RDAP** (via the `rdap.org` bootstrap) — refines the organisation (company) name from the authoritative registry record.

Results are cached in-memory (default 24h, configurable), stored on each destination, stamped on every trace report, and refreshed:

- automatically when a destination is stale (checked during traces and enrichment),
- automatically when a destination is created or its host changes,
- on demand via the **Enrich ASN / company** button on the Destinations page,
- in the background after first-time seeding and after each bulk import.

## Monitored destinations

Seeded out of the box with 60 targets, including:

- **Services:** Meta (Facebook/Instagram/WhatsApp), Google (+ 8.8.8.8, 1.1.1.1, Quad9, OpenDNS), Microsoft / Azure / M365, SpaceX / Starlink, Amazon/AWS, Netflix, Apple, Oracle.
- **Utilities:** AT&T, Hawaiian Electric.
- **CDNs:** Cloudflare, Akamai.
- **Datacenters:** Equinix (Ashburn, Sydney, Tokyo, Hong Kong, London, Frankfurt), Digital Realty (Chicago, Singapore, Sao Paulo), CoreSite LA, Interxion (London, Frankfurt), Telehouse Paris, NTT, OVHcloud, STT GDC.
- **IXPs:** DE-CIX Frankfurt, AMS-IX, LINX London, NYIIX, SIX Seattle, NAP of the Americas, HKIX, JPNAP, BBIX, SGIX, IX.br, MIX Milan, France-IX, VIX.

You can add, edit, enable/disable, trace, or delete destinations — or wipe all of a destination's data — from the UI or the API at any time. To add many destinations at once, use the [bulk import](#bulk-destination-import).

---

## Features

### Dashboard
- Clickable stat cards: **Destinations**, **Reachable**, **Unreachable**, **Uptime (24h)**, **Avg ping (now)** (global network health = average of the latest ping latency across all destinations), **Unacknowledged changes** — each navigates to the relevant filtered view.
- **Network health** chart with **Daily / Weekly / Monthly / Quarterly / Half-yearly / Yearly** tabs — one graph, period-aware x-axis labels.
- **Latest per-destination status** table (with serial numbers): reachable/unreachable, avg RTT, loss %, hops, last run — every table ships with a **top search box** (right before the page-number bar) and **50-row pagination** controls above and below.

### Reports
- **Period summaries** (`daily`, `weekly`, `monthly`, `quarterly`, `half-yearly`, `yearly` — `daily` is selected by default) with uptime %, avg RTT, change counts, and per-destination tables.
- **Raw report browser** — paginated trace reports (50 per page, searchable); click a row to open the hop-by-hop table vs the previous report.

### Destination detail
- ASN, company, registry, country, **resolved IP with live min / avg / max ping latency**, prefix.
- **Latency history** chart with the 6 period tabs, plus the **5-minute ping sample** chart (min/avg/max).
- **Trace now**, **Edit destination**, **Delete all data** buttons (admin).
- **Network path — hop-by-hop**: every trace listed as an expandable row (date/time, reachability, avg RTT, loss, hop count). Expand any number of traces side-by-side to compare, or **Export** a trace as a text file. The compare table shows `Current IP`, `Previous IP`, a **Change** tag, and an **AS Change** column (`prev AS → curr AS`, red/critical on route changes).
- **Download text report** — exports a comprehensive, human-readable report covering every monitored detail: destination info and RIR attribution, **24-hour network health** with an uptime bar and a Unicode **latency sparkline**, the latest trace (ping/RTT/path), the hop-by-hop table, recent traces and recent change events. Reports are rendered with box-drawing tables (`┌─┬─┐`), block bars (`█░`) and severity glyphs (`✖ ▲ ℹ`) — pure UTF-8 text that opens anywhere.

### Changes
- Full change log with severity badges, old → new values, per-event **acknowledge**, and a global **Acknowledge all** button. Filter by destination and severity.

### Global search
- Header search across destinations, ASNs, companies, change events and reports.

### Table search & pagination
- Every data table (Dashboard status, Reports summary & raw, Destinations) has a **search box** that filters rows instantly, placed **right before the page-number bar** at the top of the table.
- Rows are paginated **50 per page**; page-number controls appear at the top (next to search) and again at the bottom.

### Theme & layout
- **Light / dark** toggle (light is the default), persisted in the browser.
- Responsive layout at **80% of the viewport width**, with the Network path section given extra room vs Recent changes.

### Settings page (admin)
- Change the admin password.
- Tune every monitoring parameter at runtime.
- Set the data retention window and purge old data on demand.
- Bulk-import destinations from XLSX / CSV. See [Settings](#settings).

---

## Settings

Configuration is resolved in **two layers**:

1. **Environment variables** provide the defaults (see [Configuration](#configuration)).
2. A **`settings` table in PostgreSQL** overrides them at runtime. This lets you change tuning values from the UI without rebuilding or redeploying the container.

Runtime-tunable settings (the `settings` table, editable via the Settings page or the API):

| Key | Type | Default | Range | Purpose |
| --- | --- | --- | --- | --- |
| `retentionDays` | int | `365` | 1 – 36500 | purge monitoring data older than this many days |
| `traceCron` | string | `0 */6 * * *` | valid cron | traceroute schedule |
| `pingIntervalMinutes` | int | `5` | 1 – 1440 | ping sample interval |
| `pingCount` | int | `10` | 1 – 100 | packets per ping probe |
| `pingTimeoutMs` | int | `2500` | 100 – 60000 | per-packet ping timeout |
| `traceMaxHops` | int | `30` | 1 – 64 | max hops traced |
| `traceTimeoutSeconds` | int | `4` | 1 – 60 | per-probe traceroute timeout |
| `rttChangePercentThreshold` | float | `30` | 0 – 1000 | % RTT change that triggers a log |
| `rttChangeAbsThresholdMs` | float | `15` | 0 – 60000 | minimum ms change required |
| `packetLossThreshold` | float | `5` | 0 – 100 | loss % threshold |
| `rirCacheTtlHours` | int | `24` | 1 – 8760 | how long an RIR attribution is kept fresh |
| `rirEnrichConcurrency` | int | `6` | 1 – 50 | parallel lookups during bulk enrich |
| `rirRequestTimeoutMs` | int | `10000` | 1000 – 60000 | per RIR/RDAP request timeout |

Notes:

- **Changing `traceCron` or `pingIntervalMinutes` reschedules the background jobs immediately.** Other settings take effect on the next run.
- Values persist in the database, so they survive container restarts.
- The Settings page also shows current storage counts (reports, ping samples, change events, destinations).

### Admin password

The admin password is stored as a salted **scrypt** hash in the `settings` table (key `adminPasswordHash`). It is never exposed through the API.

- If no hash has been set yet, the `ADMIN_PASSWORD` environment variable is used.
- Change it from **Settings → Admin password** (requires the current password; minimum 8 characters).
- Existing sessions keep working until their token expires — they are not invalidated by a password change.

---

## Bulk destination import

From **Settings → Bulk-import destinations** (admin):

1. **Download the sample file** (`destinations-template.xlsx`) — the exact format to use.
2. Fill in your destinations and upload the file (`.xlsx`, `.xls` or `.csv`, up to 10 MB).
3. Review the per-row results: **created / skipped / failed** with row numbers and reasons.

### Columns

| Column | Required | Values |
| --- | --- | --- |
| `Name` | yes | display name |
| `Host` | yes | domain or IP (must be unique) |
| `Category` | no | `service`, `datacenter`, `ixp`, `utility`, `cdn` (default `service`) |
| `Location` | no | free text |
| `Region` | no | free text |
| `Description` | no | free text |
| `Enabled` | no | `yes` / `no` (or `true/false`, `1/0`); default `yes` |

Header names are flexible — common aliases are accepted (e.g. `hostname`, `ip`, `type`, `city`, `notes`, `active`).

### Import behaviour

- **Adds** new destinations alongside existing ones — it never deletes or truncates.
- **Skips** any host that already exists in the database (matched on the unique `host` column) and reports it as *skipped*.
- **Skips** duplicate hosts within the same file (first occurrence wins).
- **Fails** rows missing `Name`, missing `Host`, or with an invalid `Category`.
- After import, RIR ASN/company enrichment runs automatically in the background for the newly created hosts.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js 20, Express, TypeScript, **Prisma**, node-cron |
| Database | **PostgreSQL `postgres:18-alpine`** |
| Trace engine | system `ping` / `traceroute -I` (Linux), `ping` / `tracert` (Windows dev) via `child_process` |
| RIR attribution | team-cymru `whois.cymru.com` + RDAP (`rdap.org`) |
| File upload / parsing | `multer` + SheetJS `xlsx` (bulk import) |
| Frontend | React 18, Vite, TypeScript, TailwindCSS, React Router, Recharts |
| Deploy | Docker Compose, Nginx (static hosting + `/api` reverse proxy) |

## Project structure

```
upstrean-monitor/
├── backend/
│   ├── Dockerfile               # multi-stage build; auto-runs `prisma migrate deploy` on start
│   ├── prisma/
│   │   ├── schema.prisma        # models: destinations, trace_reports, trace_hops,
│   │   │                        #          change_events, change_details, ping_samples, settings
│   │   └── migrations/          # SQL migrations (applied automatically on container start)
│   ├── scripts/                 # dev tests + one-time mongo->postgres migration
│   └── src/
│       ├── config/              # env, prisma/postgres connection
│       ├── middleware/          # admin auth (signed token)
│       ├── lib/                 # API mappers (Prisma rows -> API shape)
│       ├── models/              # TS types shared by services (TraceHop, comparator, ...)
│       ├── routes/              # REST API (admin, settings, destinations, reports,
│       │                        #   changes, pings, traces, stats, search)
│       └── services/
│           ├── settings.ts      # DB-backed runtime settings + password hashing
│           ├── importDestinations.ts  # XLSX/CSV bulk import + template generator
│           ├── traceroute.ts    # ping + traceroute runner & parsers
│           ├── orchestrator.ts  # trace execution + report/change persistence
│           ├── comparator.ts    # change detection engine (incl. AS-path change)
│           ├── pingMonitor.ts   # 5-minute ping sampling
│           ├── retention.ts     # daily data-retention purge
│           ├── rir.ts           # RIR ASN/company lookup (cymru + RDAP + cache)
│           ├── enrich.ts        # DB-backed enrichment runner
│           ├── scheduler.ts     # trace + ping + retention crons
│           └── seed.ts          # initial destination list
│       └── server.ts
├── frontend/
│   ├── Dockerfile               # multi-stage build -> nginx
│   ├── nginx.conf               # serves SPA + proxies /api to backend
│   ├── public/logo.png          # brand icon (favicon + header)
│   └── src/
│       ├── pages/               # Dashboard, Destinations, Destination detail, Reports,
│       │                        #   Changes, Settings, Login
│       ├── components/          # Layout, GlobalSearch, ThemeToggle, StatCard, Badge, ...
│       └── lib/                 # api client, auth, theme, types, formatters, text-report generator
└── docker-compose.yml           # postgres + backend + frontend
```

---

## Docker deployment (VPS)

Prerequisite: a VPS with internet access (needed to reach the global destinations) and Docker + Docker Compose.

```bash
git clone <repo-url>
cd upstrean-monitor

# tune settings FIRST — never deploy with the defaults
cp .env.example .env
#  - set POSTGRES_PASSWORD to a long random string
#  - set ADMIN_PASSWORD, AUTH_TOKEN_SECRET

docker compose up -d --build
```

> **Security — read this.** PostgreSQL is bound to loopback (`127.0.0.1:5432`) only and requires authentication (`POSTGRES_USER` / `POSTGRES_PASSWORD`). The backend reaches it over the internal Docker network. **Never** expose Postgres to the public internet and **always** set a strong `POSTGRES_PASSWORD` — an unauthenticated, publicly-reachable database is wiped and ransomed by automated attacks within minutes. Keep the VM firewall enabled (see below).

Services:

| Service | URL |
| --- | --- |
| Frontend UI | http://<vps-ip>:8010/ |
| Backend API | http://<vps-ip>:5020/api |
| PostgreSQL | 127.0.0.1:5432 (loopback, auth required) |

The backend container installs `traceroute` and `iputils-ping`, is granted `NET_RAW` / `NET_ADMIN` capabilities so ICMP ping and traceroute work inside Docker, and **applies pending Prisma migrations automatically on startup** (with retries until Postgres accepts connections) — so `docker compose up -d --build` is a complete, idempotent upgrade.

### Upgrading an existing deployment

```bash
cd /path/to/upstrean-monitor
git pull                                  # or copy the updated files over
docker compose up -d --build              # rebuild, migrate, restart — everything in one command
docker compose logs -f backend            # watch for "All migrations applied" + "listening on port 5020"
```

### Firewall (recommended)

Enable a host firewall allowing only the services you expose. Example with `ufw`:

```bash
ufw default deny incoming
ufw allow OpenSSH
ufw allow 8010/tcp   # frontend UI
ufw allow 5020/tcp   # backend API (optional — or restrict to your IP)
ufw --force enable
```

`127.0.0.1:5432` stays unreachable from outside even without a rule, but the firewall is defense-in-depth against accidental re-exposure.

## First run

On startup the backend:

1. Applies any pending database migrations.
2. Seeds the default destination list (skipped if destinations already exist).
3. Starts RIR enrichment in the background.
4. Starts the trace (every 6h), ping (every 5 min) and retention (daily at 03:00) schedulers.

Run an initial full trace from the UI (**Destinations → Run full trace**) or via the API. A second report is needed per destination before comparisons can produce change events.

### Migrating from MongoDB (optional, one-time)

If you previously ran the app on MongoDB and want to preserve history when moving to PostgreSQL:

```bash
# Run inside the backend container (or with node + tsx):
#   MONGODB_URI=<old mongo> DATABASE_URL=<new postgres> \
#   npx tsx scripts/migrate-mongo-to-postgres.ts
npm run migrate:from-mongo --prefix backend
```

The script truncates the Postgres tables first, then copies destinations, trace reports (+ hops), change events (+ details) and ping samples, skipping orphaned rows.

---

## Local development (without Docker)

```bash
# 1. PostgreSQL must be running locally (16+; the compose image is 18-alpine)
# 2. Backend
cd backend
cp .env.example .env       # point DATABASE_URL at your local postgres
npm install
npx prisma migrate deploy  # apply schema
npm run dev                # API on :5020

# 3. Frontend (in a second terminal)
cd frontend
npm install
npm run dev                # Vite on :5173, proxies /api -> localhost:5020
```

---

## Configuration

### Environment variables

See `.env.example`. Key variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (Prisma) |
| `POSTGRES_USER` | `upstream` | PostgreSQL user (docker-compose) |
| `POSTGRES_PASSWORD` | — | PostgreSQL password (**change in production**) |
| `TRACE_CRON` | `0 */6 * * *` | traceroute schedule (cron, default every 6h) |
| `PING_COUNT` | `10` | packets per ping probe |
| `PING_INTERVAL_MINUTES` | `5` | ping sample interval (latency graphs) |
| `PING_TIMEOUT_MS` | `2500` | per-packet ping timeout |
| `TRACEROUTE_MAX_HOPS` | `30` | max hops traced |
| `TRACEROUTE_TIMEOUT_SECONDS` | `4` | per-probe traceroute timeout |
| `RTT_CHANGE_PERCENT_THRESHOLD` | `30` | % RTT change that triggers a log |
| `RTT_CHANGE_ABS_THRESHOLD_MS` | `15` | minimum ms change required |
| `PACKET_LOSS_THRESHOLD` | `5` | loss % threshold (informational) |
| `CORS_ORIGIN` | `*` | allowed CORS origins (comma-separated) |
| `ADMIN_PASSWORD` | `admin` | admin panel password (**change in production**) |
| `AUTH_TOKEN_SECRET` | — | HMAC secret for admin session tokens (**change in production**) |
| `ADMIN_TOKEN_TTL_SECONDS` | `43200` | admin session token lifetime (12h) |
| `RIR_REQUEST_TIMEOUT_MS` | `10000` | per RIR/RDAP request timeout |
| `RIR_ENRICH_CONCURRENCY` | `6` | parallel lookups during bulk enrich |
| `RIR_CACHE_TTL_HOURS` | `24` | how long an RIR attribution is kept fresh |
| `RETENTION_DAYS` | `365` | purge data older than this (runs daily at 03:00) |

> All of these except `DATABASE_URL`, `POSTGRES_*`, `CORS_ORIGIN`, `PORT`, `AUTH_TOKEN_SECRET` and `ADMIN_TOKEN_TTL_SECONDS` can also be overridden at runtime from the Settings page (stored in the `settings` table). Environment variables act as the initial defaults.

---

## API reference

Base path: `/api`. Write endpoints require the admin token (see [Admin panel & authentication](#admin-panel--authentication)).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | liveness |
| POST | `/api/admin/login` | admin login `{ password }` → `{ token, expiresAt }` |
| GET | `/api/stats` | dashboard statistics (counts, recovery, network latency, 24h uptime/RTT) |
| GET | `/api/stats/trend?hours=` | hourly-bucketed uptime + latency series |
| GET | `/api/destinations` | list destinations |
| POST | `/api/destinations` | create a destination (admin) |
| GET | `/api/destinations/:id` | get one destination |
| PUT | `/api/destinations/:id` | update a destination (admin) |
| DELETE | `/api/destinations/:id` | delete a destination + cascade its data (admin) |
| DELETE | `/api/destinations/:id/data` | delete all reports/changes/pings for a destination (admin) |
| POST | `/api/destinations/enrich` | bulk RIR attribution (admin) |
| GET | `/api/destinations/import/template` | download the sample XLSX import template |
| POST | `/api/destinations/import` | bulk-import destinations from an uploaded XLSX/CSV file (admin, multipart field `file`) |
| GET | `/api/reports` | paginated trace reports (`?destinationId=&page=&limit=&from=&to=`) |
| GET | `/api/reports/latest` | latest report per destination |
| GET | `/api/reports/period?period=&destinationId=` | period summary (`daily`…`yearly`) |
| GET | `/api/reports/:id` | full report incl. hop table |
| GET | `/api/reports/:id/compare` | hop-by-hop diff vs previous report |
| GET | `/api/pings/:destinationId` | ping latency samples for a destination |
| GET | `/api/changes` | paginated change events (`?destinationId=&severity=&acknowledged=`) |
| POST | `/api/changes/:id/acknowledge` | acknowledge a change (admin) |
| POST | `/api/changes/acknowledge-all` | acknowledge all, optionally scoped by `destinationId` (admin) |
| POST | `/api/traces/run` | run trace now — one destination or all (admin) |
| GET | `/api/traces/status` | whether a trace run is in progress |
| GET | `/api/search?q=` | global search across destinations/changes/reports |
| GET | `/api/settings` | current runtime settings + storage counts (admin) |
| PUT | `/api/settings` | update one or more runtime settings (admin) |
| POST | `/api/settings/password` | change admin password `{ currentPassword, newPassword }` (admin) |
| POST | `/api/settings/retention/run` | run the retention purge immediately (admin) |

---

## Admin panel & authentication

Destinations, settings and all write operations are protected behind an admin login (`ADMIN_PASSWORD`). Log in from the **Admin** button in the header.

- Sessions use a **signed bearer token** (`AUTH_TOKEN_SECRET`, expiry `ADMIN_TOKEN_TTL_SECONDS`).
- Send it as `Authorization: Bearer <token>`.
- Write endpoints (`POST/PUT/DELETE`, trace runs, change acknowledgement, `/api/settings`) return `401` without a valid token; read endpoints stay public.
- Once you change the admin password from Settings, login verifies the stored scrypt hash. See [Admin password](#admin-password).

---

## Data retention

Monitoring data accumulates continuously (a 10-packet ping sample every 5 minutes per destination). To keep the database bounded:

- A **retention job runs daily at 03:00** and deletes `trace_reports`, `ping_samples` and `change_events` older than the configured window.
- The window is set with `retentionDays` (default 365) — from Settings, from `RETENTION_DAYS`, or via `PUT /api/settings`.
- Use **Settings → Purge old data now** (`POST /api/settings/retention/run`) to apply the purge immediately instead of waiting for the nightly job.
- The Settings page shows current row counts so you can size the window.

Deleting a destination (or its data) is separate and immediate.

---

## Security & operations notes

- **Change the defaults before exposing publicly:** `ADMIN_PASSWORD`, `AUTH_TOKEN_SECRET`, `POSTGRES_PASSWORD`.
- The admin panel protects all write operations. Read endpoints (dashboard, reports, changes, search) are public; place the stack behind a reverse proxy (e.g. Caddy/Traefik with auth) or firewall ports if the whole UI should be private.
- For ICMP-based probes the VPS host must allow outbound ICMP; some cloud providers filter it, in which case traceroute falls back to path data from hops that still answer.
- Runtime settings live in the database. If you want to reset a setting to its environment default, delete the row from the `settings` table (or `PUT /api/settings` with the default value) — the env default is used when no DB value exists.

## Database migrations

- Schema lives in `backend/prisma` and migrations in `backend/prisma/migrations`.
- **In Docker, migrations apply automatically on container start** (`prisma migrate deploy`), so deployments are a single `docker compose up -d --build`.
- Locally, run `npx prisma migrate deploy` (backend dir) after pulling new code, or `npm run db:migrate --prefix backend`.
- `postgres:18-alpine` stores its data under `/var/lib/postgresql` (Docker volume `postgres_data`).

## Testing

```bash
# Backend unit/smoke tests (no DB required)
npm run test:smoke --prefix backend       # trace engine (needs ping/traceroute)
npm run test:rir --prefix backend         # RIR parsers + concurrency pool
npm run test:traceroute --prefix backend  # linux traceroute parser regression
npm run test:comparator --prefix backend  # change-detection engine (AS path, IP, RTT, ...)
```

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Backend restarts in a loop | Postgres not ready — the image retries `prisma migrate deploy` up to 30 times before giving up; check `docker compose logs backend`. |
| `Prisma failed to detect the libssl/openssl version` warning | Harmless in the `node:20-slim` image; Prisma defaults to OpenSSL 1.1. |
| All destinations unreachable / no hops | Outbound ICMP filtered by the cloud provider; allow ICMP or accept partial path data. |
| `401` on write endpoints | Admin token missing/expired — log in again. |
| Bulk import reports "already exists" | Host is already monitored; imports add new hosts and skip duplicates — nothing is overwritten. |

## License

MIT.
