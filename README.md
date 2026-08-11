# Upstream Monitoring System

A network monitoring platform that:

- **Traces** major global internet services, datacenters, and Internet Exchange Points (IXPs) every hour, and **logs the details of any change** it detects for the same destination between consecutive reports.
- **Attributes** every destination with its **AS number, company name, and registry data** from the Regional Internet Registries (ARIN / RIPE / APNIC / LACNIC / AFRINIC), resolved live from the target's IP.
- Ships with a **global search**, **light/dark themes**, **period availability & latency reports** (daily … yearly), and a per-destination **history page**.
- **Admin panel** (password protected) to add, edit, enable/disable and remove destinations.

Built with the **MERN stack** (MongoDB `4.4-focal`, Express, React, Node.js) and deployed with **Docker Compose**.

## How it works

1. A scheduler (default cron `0 * * * *`, i.e. once every hour) runs a **ping + traceroute** against every enabled destination.
2. Each run produces a **TraceReport** (packet loss, RTT stats, hop-by-hop path, path fingerprint).
3. The **comparator** diffs each new report against the previous report *for the same destination* and detects changes such as:

| Detected change | Example |
| --- | --- |
| Reachability | destination became unreachable / recovered |
| Path change | hop IP sequence differs between runs |
| Hop added / removed | new router appeared, or one vanished |
| Hop IP change | a specific TTL now resolves to a different IP |
| RTT shift | average RTT moved by ≥ threshold (default 30%) |
| Packet loss | loss % changed between reports |

4. Any detected change is written to a **ChangeEvent** collection with severity (`info` / `warning` / `critical`) and a detailed structured diff (old value → new value), visible in the UI.

## RIR ASN / company attribution

For every destination the backend resolves the target IP and queries:

- **team-cymru `whois.cymru.com`** origin-ASN service — returns ASN, BGP prefix, country, and registry (ARIN/RIPE/APNIC/LACNIC/AFRINIC), based on RIR registration data.
- **RDAP** (via the `rdap.org` bootstrap) — the RIR-standard API — to refine the organisation (company) name from the authoritative registry record.

Results are cached in-memory (default 24h), stored on each destination, stamped on every trace report, and refreshed:

- automatically during each hourly trace run (when stale),
- automatically when a destination is created or its host changes,
- on demand via the **Enrich ASN / company** button on the Destinations page,
- in the background after first-time seeding.

## Monitored destinations

Seeded out of the box with 50+ targets, including:

- **Services:** Meta (Facebook/Instagram/WhatsApp), Google (+ 8.8.8.8, 1.1.1.1, Quad9, OpenDNS), Microsoft / Azure / M365, SpaceX / Starlink, Amazon/AWS, Netflix, Apple, Oracle.
- **Utilities:** AT&T, Hawaiian Electric.
- **CDNs:** Cloudflare, Akamai.
- **Datacenters:** Equinix (Ashburn, Sydney, Tokyo, Hong Kong, London, Frankfurt), Digital Realty (Chicago, Singapore, Sao Paulo), CoreSite LA, Interxion (London, Frankfurt), Telehouse Paris, NTT, OVHcloud, STT GDC.
- **IXPs:** DE-CIX Frankfurt, AMS-IX, LINX London, NYIIX, SIX Seattle, NAP of the Americas, HKIX, JPNAP, BBIX, SGIX, IX.br, MIX Milan, France-IX, VIX.

You can add, edit, enable/disable, or delete destinations from the UI or API at any time.

## Features

- **Dashboard** — reachable/unreachable counts, 24h uptime %, 24h average RTT, a live health chart, and the latest per-destination status with ASN/company.
- **Reports** — period summaries (`daily`, `weekly`, `monthly`, `quarterly`, `half-yearly`, `yearly`) with uptime %, average RTT and per-destination tables, plus the raw trace-report browser.
- **Destination detail** — ASN, company, registry, country, resolved IP and prefix; RTT history chart; recent change events and trace reports.
- **Changes** — full change log with severity badges, old → new values, acknowledgement, filters.
- **Global search** (header) — search across destinations, ASNs, companies, change events and reports.
- **Light / dark theme** — toggle in the header, persisted in the browser.

## Tech stack

- **Backend:** Node.js, Express, TypeScript, Mongoose, node-cron
- **Trace engine:** system `ping` / `traceroute` (Linux) and `ping` / `tracert` (Windows dev) via `child_process`
- **RIR attribution:** team-cymru `whois.cymru.com` + RDAP (rdap.org bootstrap)
- **Frontend:** React 18, Vite, TypeScript, TailwindCSS, React Router, Recharts
- **Database:** MongoDB `mongo:4.4-focal`
- **Deploy:** Docker Compose, Nginx (static hosting + `/api` reverse proxy)

## Project structure

```
upstrean-monitor/
├── backend/
│   ├── Dockerfile               # multi-stage build: node:20-slim + traceroute + iputils-ping
│   ├── scripts/                 # dev tests (trace engine, comparator, RIR, full E2E)
│   └── src/
│       ├── config/              # env, mongo connection
│       ├── middleware/          # admin auth (signed token)
│       ├── models/              # Destination, TraceReport, ChangeEvent
│       ├── routes/              # REST API (admin, destinations, reports, changes, search, ...)
│       ├── services/
│       │   ├── traceroute.ts    # ping + traceroute runner & parsers
│       │   ├── orchestrator.ts  # trace execution + report/change persistence
│       │   ├── comparator.ts    # change detection engine
│       │   ├── rir.ts           # RIR ASN/company lookup (cymru + RDAP + cache)
│       │   ├── enrich.ts        # DB-backed enrichment runner
│       │   ├── scheduler.ts     # hourly trace cron
│       │   └── seed.ts          # initial destination list
│       └── server.ts
├── frontend/
│   ├── Dockerfile               # multi-stage build -> nginx
│   ├── nginx.conf               # serves SPA + proxies /api to backend
│   └── src/
│       ├── pages/               # Dashboard, Destinations, Destination detail,
│       │                        # Reports, Changes, Login
│       ├── components/          # Layout, GlobalSearch, ThemeToggle, StatCard, Badge, ...
│       └── lib/                 # api client, auth, theme, types, formatters
└── docker-compose.yml           # mongodb + backend + frontend
```

## Admin panel

Destinations are protected behind an admin login (`ADMIN_PASSWORD`). Log in from the **Admin** button in the header. Sessions use a signed bearer token (`AUTH_TOKEN_SECRET`, expiry `ADMIN_TOKEN_TTL_SECONDS`). The write endpoints (`POST/PUT/DELETE /api/destinations`, `/api/destinations/enrich`, `/api/traces/run`) return `401` without a valid token; read endpoints stay public.

## Docker deployment (VPS)

Prerequisite: a VPS with internet access (needed to reach the global destinations) and Docker + Docker Compose.

```bash
git clone <repo-url>
cd upstrean-monitor

# tune settings FIRST — never deploy with the defaults
cp .env.example .env
#  - set MONGO_ROOT_PASSWORD to a long random string
#  - set ADMIN_PASSWORD, AUTH_TOKEN_SECRET

docker compose up -d --build
```

> **Security — read this.** MongoDB is bound to loopback (`127.0.0.1:27017`) only and
> requires authentication (`MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD`). The
> backend reaches it over the internal Docker network. **Never** expose Mongo to
> the public internet and **always** set a strong `MONGO_ROOT_PASSWORD` — an
> unauthenticated, publicly-reachable Mongo instance is wiped and ransomed by
> automated attacks within minutes. Keep the VM firewall enabled (see below).

Services:

| Service | URL |
| --- | --- |
| Frontend UI | http://<vps-ip>:8010/ |
| Backend API | http://<vps-ip>:5020/api |
| MongoDB | 127.0.0.1:27017 (loopback, auth required) |

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

`127.0.0.1:27017` stays unreachable from outside even without a rule, but the
firewall is defense-in-depth against accidental re-exposure.

### First run

On startup the backend seeds the destination list, starts RIR enrichment in the background, and starts the hourly scheduler. Run an initial full trace immediately from the UI (`Dashboard → Run full trace now`) or via the API. A second report is needed per destination before comparisons can produce change events.

## Local development (without Docker)

```bash
# 1. MongoDB must be running locally (4.4+)
# 2. Backend
cd backend
cp .env.example .env       # point MONGODB_URI at your local mongo
npm install
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
| `TRACE_CRON` | `0 * * * *` | hourly traceroute schedule (cron) |
| `PING_COUNT` | `4` | packets per ping probe |
| `PING_TIMEOUT_MS` | `2500` | per-packet ping timeout |
| `TRACEROUTE_MAX_HOPS` | `30` | max hops traced |
| `TRACEROUTE_TIMEOUT_SECONDS` | `4` | per-probe traceroute timeout |
| `RTT_CHANGE_PERCENT_THRESHOLD` | `30` | % RTT change that triggers a log |
| `RTT_CHANGE_ABS_THRESHOLD_MS` | `15` | minimum ms change required |
| `PACKET_LOSS_THRESHOLD` | `5` | loss % threshold (informational) |
| `ADMIN_PASSWORD` | `admin123` | admin panel password (**change in production**) |
| `AUTH_TOKEN_SECRET` | — | HMAC secret for admin session tokens |
| `RIR_REQUEST_TIMEOUT_MS` | `10000` | per RIR/RDAP request timeout |
| `RIR_ENRICH_CONCURRENCY` | `6` | parallel lookups during bulk enrich |
| `RIR_CACHE_TTL_HOURS` | `24` | how long an RIR attribution is kept fresh |

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | liveness |
| POST | `/api/admin/login` | admin login `{ password }` → `{ token }` |
| GET | `/api/stats` | dashboard statistics (incl. 24h uptime / avg RTT) |
| GET | `/api/stats/trend?hours=` | hourly-bucketed uptime + latency series |
| GET/POST | `/api/destinations` | list / create destinations (write = admin) |
| GET/PUT/DELETE | `/api/destinations/:id` | get / update / delete (write = admin) |
| POST | `/api/destinations/enrich` | bulk RIR attribution (admin) |
| GET | `/api/reports` | paginated trace reports (`?destinationId=&page=&limit=`) |
| GET | `/api/reports/latest` | latest report per destination |
| GET | `/api/reports/period?period=&destinationId=` | period summary (`daily`…`yearly`) |
| GET | `/api/reports/:id` | full report incl. hop table |
| GET | `/api/changes` | paginated change events (`?destinationId=&severity=`) |
| POST | `/api/changes/:id/acknowledge` | acknowledge a change |
| POST | `/api/traces/run` | run trace now (admin) |
| GET | `/api/search?q=` | global search across destinations/changes/reports |

## Security & operations notes

- **Change the defaults before exposing publicly:** `ADMIN_PASSWORD`, `AUTH_TOKEN_SECRET` (see `.env.example` / docker-compose env).
- The admin panel protects all write operations. Read endpoints (dashboard, reports, changes, search) are public; place Nginx behind a reverse proxy (e.g. Caddy/Traefik with auth) or firewall ports if the whole UI should be private.
- For ICMP-based probes the VPS host must allow outbound ICMP; some cloud providers filter it, in which case traceroute still yields UDP-based path data.
- Mongo `4.4-focal` is EOL for official updates — pin a maintained image if you prefer, but the stack is compatible with 4.4+.

## Testing

```bash
# Backend unit/smoke tests (no DB required)
npm run test:smoke --prefix backend       # trace engine (needs ping/traceroute)
npm run test:rir --prefix backend         # RIR parsers + concurrency pool
npm run test:traceroute --prefix backend  # linux traceroute parser regression

# Full end-to-end test (spins up an in-memory MongoDB automatically)
npm run test:e2e --prefix backend
```

## License

MIT.
