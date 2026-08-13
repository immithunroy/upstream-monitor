# Upstream Monitoring System

A self-hosted network monitoring platform that watches the routes and latency of major internet services, datacenters, CDNs, IXPs and utilities from your own vantage point.

- **Traces** every monitored destination (ping + ICMP traceroute) on a schedule — default every 6 hours — and **detects route, IP, AS-path and latency changes** between consecutive reports.
- **Samples latency** with a 10-packet ping **every 5 minutes** per destination, graphing min / max / avg on each destination page and driving the global "network health" metric.
- **Attributes** every destination and each hop with its **AS number, company name, country, prefix and registry** from Regional Internet Registries (ARIN / RIPE / APNIC / LACNIC / AFRINIC), resolved live via team-cymru + RDAP.
- Ships with **period availability & latency reports** (daily … yearly), a **global search**, **light/dark themes**, an **admin panel**, and per-destination **history** pages.
- Deployed with **Docker Compose** on a single VPS.

Built with the **PERN + TypeScript stack** (PostgreSQL `18-alpine`, Express, React, Node.js) using **Prisma** for the data layer.

---

## How it works

1. A **trace scheduler** (default cron `0 */6 * * *`, every 6 hours) runs an **ICMP traceroute** (`traceroute -I`) + a 10-packet ping against every enabled destination.
2. A **ping loop** (default cron `*/5 * * * *`) records a `PingSample` (min / max / avg latency + packet loss) per destination for the latency graphs and the network-health metric.
3. Each trace run produces a `TraceReport` (packet loss, RTT stats, hop-by-hop path with per-hop IP / ASN / company, path fingerprint).
4. The **comparator** diffs each new report against the previous report *for the same destination* and detects changes:

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

5. Any detected change is written to a `ChangeEvent` with severity and a structured diff (old → new value), visible in the UI and acknowledged from the Changes page.

## RIR ASN / company attribution

For every destination IP (and every trace hop IP) the backend queries:

- **team-cymru `whois.cymru.com`** origin-ASN service — ASN, BGP prefix, country, registry.
- **RDAP** (via the `rdap.org` bootstrap) — refines the organisation (company) name from the authoritative registry record.

Results are cached in-memory (default 24h), stored on each destination, stamped on every trace report, and refreshed:

- automatically when a destination is stale (checked during traces and enrichment),
- automatically when a destination is created or its host changes,
- on demand via the **Enrich ASN / company** button on the Destinations page,
- in the background after first-time seeding.

## Monitored destinations

Seeded out of the box with 60 targets, including:

- **Services:** Meta (Facebook/Instagram/WhatsApp), Google (+ 8.8.8.8, 1.1.1.1, Quad9, OpenDNS), Microsoft / Azure / M365, SpaceX / Starlink, Amazon/AWS, Netflix, Apple, Oracle.
- **Utilities:** AT&T, Hawaiian Electric.
- **CDNs:** Cloudflare, Akamai.
- **Datacenters:** Equinix (Ashburn, Sydney, Tokyo, Hong Kong, London, Frankfurt), Digital Realty (Chicago, Singapore, Sao Paulo), CoreSite LA, Interxion (London, Frankfurt), Telehouse Paris, NTT, OVHcloud, STT GDC.
- **IXPs:** DE-CIX Frankfurt, AMS-IX, LINX London, NYIIX, SIX Seattle, NAP of the Americas, HKIX, JPNAP, BBIX, SGIX, IX.br, MIX Milan, France-IX, VIX.

You can add, edit, enable/disable, trace, or delete destinations — or wipe all of a destination's data — from the UI or API at any time.

---

## Features

### Dashboard
- Clickable stat cards: **Destinations**, **Reachable**, **Unreachable**, **Uptime (24h)**, **Avg ping (now)** (global network health = average of the latest ping latency across all destinations), **Unacknowledged changes** — each navigates to the relevant filtered view.
- **Network health** chart with **Daily / Weekly / Monthly / Quarterly / Half-yearly / Yearly** tabs — one graph, period-aware x-axis labels (weekday for daily/weekly, month for longer periods).
- **Latest per-destination status** table (with serial numbers): reachable/unreachable, avg RTT, loss %, hops, last run.

### Reports
- **Period summaries** (`daily`, `weekly`, `monthly`, `quarterly`, `half-yearly`, `yearly`) with uptime %, avg RTT, change counts, and per-destination tables — network health graph uses the same period tabs.
- **Raw report browser** — paginated trace reports; click a row to open the hop-by-hop table vs the previous report.

### Destination detail
- ASN, company, registry, country, **resolved IP with live min / avg / max ping latency** (avg emphasised), prefix.
- **Latency history** chart with the same 6 period tabs, plus the **5-minute ping sample** chart (min/avg/max).
- **Trace now**, **Edit destination**, **Delete all data** buttons (admin).
- **Network path — hop-by-hop**: every trace listed as an expandable row (date/time, reachability, avg RTT, loss, hop count). Expand any number of traces side-by-side to compare, or **Export** a trace as a text file. The compare table shows `Current IP`, `Previous IP`, a **Change** tag, and an **AS Change** column (`prev AS → curr AS`, red/critical on route changes).

### Changes
- Full change log with severity badges, old → new values, per-event **acknowledge**, and a global **Acknowledge all** button. Filter by destination and severity.

### Global search
- Header search across destinations, ASNs, companies, change events and reports.

### Theme & layout
- **Light / dark** toggle (light is the default), persisted in the browser.
- Responsive layout at **80% of the viewport width**, with the Network path section given extra room vs Recent changes.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js 20, Express, TypeScript, **Prisma**, node-cron |
| Database | **PostgreSQL `postgres:18-alpine`** |
| Trace engine | system `ping` / `traceroute -I` (Linux), `ping` / `tracert` (Windows dev) via `child_process` |
| RIR attribution | team-cymru `whois.cymru.com` + RDAP (`rdap.org`) |
| Frontend | React 18, Vite, TypeScript, TailwindCSS, React Router, Recharts |
| Deploy | Docker Compose, Nginx (static hosting + `/api` reverse proxy) |

## Project structure

```
upstrean-monitor/
├── backend/
│   ├── Dockerfile               # multi-stage build: node:20-slim + traceroute + iputils-ping
│   ├── prisma/
│   │   ├── schema.prisma        # models: destinations, trace_reports, trace_hops,
│   │   │                        #          change_events, change_details, ping_samples
│   │   └── migrations/          # SQL migrations (applied with prisma migrate deploy)
│   ├── scripts/                 # dev tests + one-time mongo->postgres migration
│   └── src/
│       ├── config/              # env, prisma/postgres connection
│       ├── middleware/          # admin auth (signed token)
│       ├── lib/                 # API mappers (Prisma rows -> API shape)
│       ├── models/              # TS types shared by services (TraceHop, comparator, ...)
│       ├── routes/              # REST API (admin, destinations, reports, changes, pings, search, stats, traces)
│       ├── services/
│       │   ├── traceroute.ts    # ping + traceroute runner & parsers
│       │   ├── orchestrator.ts  # trace execution + report/change persistence
│       │   ├── comparator.ts    # change detection engine (incl. AS-path change)
│       │   ├── pingMonitor.ts   # 5-minute ping sampling
│       │   ├── retention.ts     # daily data-retention purge (default 1 year)
│       │   ├── rir.ts           # RIR ASN/company lookup (cymru + RDAP + cache)
│       │   ├── enrich.ts        # DB-backed enrichment runner
│       │   ├── scheduler.ts     # trace + ping + retention crons
│       │   └── seed.ts          # initial destination list
│       └── server.ts
├── frontend/
│   ├── Dockerfile               # multi-stage build -> nginx
│   ├── nginx.conf               # serves SPA + proxies /api to backend
│   ├── public/logo.png          # brand icon (favicon + header)
│   └── src/
│       ├── pages/               # Dashboard, Destinations, Destination detail, Reports, Changes, Login
│       ├── components/          # Layout, GlobalSearch, ThemeToggle, StatCard, Badge, ...
│       └── lib/                 # api client, auth, theme, types, formatters
└── docker-compose.yml           # postgres + backend + frontend
```

## Admin panel

Destinations and all write operations are protected behind an admin login (`ADMIN_PASSWORD`). Log in from the **Admin** button in the header. Sessions use a signed bearer token (`AUTH_TOKEN_SECRET`, expiry `ADMIN_TOKEN_TTL_SECONDS`). Write endpoints (`POST/PUT/DELETE /api/destinations`, `/api/destinations/enrich`, `/api/traces/run`, change acknowledgement) return `401` without a valid token; read endpoints stay public.

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

The backend container installs `traceroute` and `iputils-ping` and is granted `NET_RAW` / `NET_ADMIN` capabilities so ICMP ping and traceroute work inside Docker.

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

### First run

On startup the backend seeds the destination list, starts RIR enrichment in the background, and starts the trace (every 6h), ping (every 5 min) and retention (daily at 03:00) schedulers. Run an initial full trace from the UI (**Destinations → Run full trace**) or via the API. A second report is needed per destination before comparisons can produce change events.

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

## Configuration

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
| `ADMIN_PASSWORD` | `admin` | admin panel password (**change in production**) |
| `AUTH_TOKEN_SECRET` | — | HMAC secret for admin session tokens |
| `RIR_REQUEST_TIMEOUT_MS` | `10000` | per RIR/RDAP request timeout |
| `RIR_ENRICH_CONCURRENCY` | `6` | parallel lookups during bulk enrich |
| `RIR_CACHE_TTL_HOURS` | `24` | how long an RIR attribution is kept fresh |
| `RETENTION_DAYS` | `365` | purge data older than this (runs daily at 03:00) |

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | liveness |
| POST | `/api/admin/login` | admin login `{ password }` → `{ token }` |
| GET | `/api/stats` | dashboard statistics (counts, recovery, network latency, 24h uptime/RTT) |
| GET | `/api/stats/trend?hours=` | hourly-bucketed uptime + latency series |
| GET/POST | `/api/destinations` | list / create destinations (write = admin) |
| GET/PUT/DELETE | `/api/destinations/:id` | get / update / delete (write = admin) |
| DELETE | `/api/destinations/:id/data` | delete all reports/changes/pings for a destination (admin) |
| POST | `/api/destinations/enrich` | bulk RIR attribution (admin) |
| GET | `/api/reports` | paginated trace reports (`?destinationId=&page=&limit=&from=&to=`) |
| GET | `/api/reports/latest` | latest report per destination |
| GET | `/api/reports/period?period=&destinationId=` | period summary (`daily`…`yearly`) |
| GET | `/api/reports/:id` | full report incl. hop table |
| GET | `/api/reports/:id/compare` | hop-by-hop diff vs previous report |
| GET | `/api/pings/:destinationId` | ping latency samples for a destination |
| GET | `/api/changes` | paginated change events (`?destinationId=&severity=&acknowledged=`) |
| POST | `/api/changes/:id/acknowledge` | acknowledge a change (admin) |
| POST | `/api/changes/acknowledge-all` | acknowledge all (optionally scoped by `destinationId`) (admin) |
| POST | `/api/traces/run` | run trace now — one destination or all (admin) |
| GET | `/api/search?q=` | global search across destinations/changes/reports |

## Security & operations notes

- **Change the defaults before exposing publicly:** `ADMIN_PASSWORD`, `AUTH_TOKEN_SECRET`, `POSTGRES_PASSWORD`.
- The admin panel protects all write operations. Read endpoints (dashboard, reports, changes, search) are public; place the stack behind a reverse proxy (e.g. Caddy/Traefik with auth) or firewall ports if the whole UI should be private.
- For ICMP-based probes the VPS host must allow outbound ICMP; some cloud providers filter it, in which case traceroute falls back to path data from hops that still answer.
- The database schema lives in `backend/prisma` and is applied with `prisma migrate deploy`; `postgres:18-alpine` stores its data under `/var/lib/postgresql`.

## Testing

```bash
# Backend unit/smoke tests (no DB required)
npm run test:smoke --prefix backend       # trace engine (needs ping/traceroute)
npm run test:rir --prefix backend         # RIR parsers + concurrency pool
npm run test:traceroute --prefix backend  # linux traceroute parser regression
npm run test:comparator --prefix backend  # change-detection engine (AS path, IP, RTT, ...)
```

## License

MIT.
