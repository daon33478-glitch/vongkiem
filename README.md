# Vòng Kiếm — RAM / WebSocket backend 1.10.1

Single-process Node server for the online game. Authoritative game rooms live in RAM; the simulation never reads or writes a database. The frontend remains on its existing hosting service.

## Run and test

Use Node 24 LTS. From the repository root:

```sh
npm ci --prefix realtime --omit=dev
npm test --prefix realtime
node realtime/server.mjs
```

Set `ARENA_JOIN_SECRET` (at least 32 random characters) and `SITE_ORIGIN` (the exact frontend HTTPS origin) through the host's secret/environment settings before starting. Never commit these secret values. `PORT` defaults to 10000; HTTP and WebSocket use the same port on `0.0.0.0`.

## Render configuration

Deploy the `main` branch as one **Web Service**, **Node**, **Free**, **Singapore**, with automatic deploy disabled. Build: `npm ci --prefix realtime --omit=dev`. Start: `node realtime/server.mjs`. Use the default TCP readiness probe; `/healthz` is available for functional verification. Set `NODE_VERSION=24`, `SITE_ORIGIN`, and `ARENA_JOIN_SECRET` in Render. Do not create a database, disk, worker or paid instance for this release.

The source of truth for this service's settings is Render's service configuration (not a Blueprint).

The frontend gateway needs the same `ARENA_JOIN_SECRET` and `ARENA_WS_URL=wss://<actual-service-host>/arena`. Keep the frontend's existing access policy. Before enabling the endpoint, confirm both health and an authenticated WebSocket session on the live deployment.

## Protocol and limits

- `/healthz` returns connected human counts per map and in total, with no credentials.
- `/arena` accepts WebSocket upgrades from the configured origin and requires a signed, single-use, two-minute join ticket in the first message. The signing key stays on the two servers.
- Five maps; eight human sessions per map. NPCs do not contribute to online counts. Disconnects reserve a seat for 15 seconds; resume tokens rotate after use.
- Simulation ticks at 60 Hz; state deltas broadcast at 20 Hz. Socket input is bounded and validated. Movement, pickups, damage, items, map transfers and ranking are resolved by the server.
- Client pong RTT measures a real network round trip; it is not a guarantee of render/input latency. Prediction and remote interpolation smooth movement between packets.
- One server instance only. Multiple instances do not share this RAM state. Restart/deploy resets active matches. Empty rooms are discarded after 30 seconds.
- Render Free sleeps after 15 minutes without incoming HTTP/WebSocket traffic and may take about a minute to wake. It has CPU, bandwidth and instance-hour limits; it cannot guarantee Internet ping below 30 ms or sustained maximum capacity.

This export includes only the backend, its shared game logic, client protocol modules and tests. It excludes images/audio, account credentials, frontend hosting identity, runtime data and local dependency folders. The source game repository maintains release notes and the export script.

## 1.10.1 performance changes

Snapshot comparison avoids repeated JSON encoding. Unchanged normalized geometry is cached immutably, per-room visual data is shared during a broadcast, and internal AI/path bookkeeping is excluded from the wire. Clients animate footsteps and use a 50 ms minimum WebSocket interpolation buffer with exact 50 ms input deadlines. Ping remains the measured round-trip time, not a synthetic target. Wall queries use allocation-free clipping; all authoritative blade colliders and physics substeps remain enabled.

Free capacity must be measured with the actual game workload. The configured 8 players per map / 40 total is an admission limit, not a tested Free-tier performance guarantee.
