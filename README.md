# Backup Service

Standalone Node.js + TypeScript worker that backs up MongoDB Atlas databases for multiple websites and uploads archives to **Cloudflare R2**.

- No frontend, REST API, or health endpoint
- No catalog database — metadata lives next to each backup in R2
- VPS is ephemeral compute only; local temp files are deleted after upload

## How it works

1. Load every `config/sites/*.ts` site config
2. For each enabled site: `mongodump --archive --gzip`
3. Compute SHA-256 checksum
4. Upload `{siteId}/{timestamp}.archive.gz` + `{siteId}/{timestamp}.meta.json` to R2
5. Delete local temp files
6. Enforce per-site retention in R2

Nightly cron runs all sites sequentially. Manual CLI commands are available for testing.

## Project layout

```
config/sites/          # One TypeScript file per website
src/
  backup/runBackup.ts  # Pipeline orchestrator
  dump/mongoDump.ts    # mongodump wrapper
  storage/             # StorageProvider + R2
  retention/cleanup.ts # Age-based R2 cleanup
  cli.ts / index.ts    # CLI + cron daemon
docker/                # Dockerfile + compose
```

## Prerequisites

1. Cloudflare R2 bucket + API token (read/write)
2. Atlas network allowlist includes your VPS outbound IP
3. Atlas user(s) with `read` on each target database
4. Node.js 20+ (local) or Docker

## Setup

```bash
cp .env.example .env
# Fill R2 credentials and MongoDB URIs

# Add a site config (copy an example)
cp config/sites/bagrot.example.ts config/sites/bagrot.ts
# Edit id / database / uriEnv / retentionDays / enabled

npm install
npm run build
```

### Site config example

```typescript
// config/sites/bagrot.ts
import type { SiteConfig } from '../../src/config/types.js'

export const site: SiteConfig = {
  id: 'bagrot',
  database: 'bagrot_production',
  uriEnv: 'BAGROT_MONGODB_URI', // env var NAME only — never the URI
  retentionDays: 30,
  enabled: true,
}
```

Secrets belong only in `.env`:

```bash
BAGROT_MONGODB_URI=mongodb+srv://...
```

## CLI

```bash
# One site
npm run backup -- bagrot

# All enabled sites
npm run backup-all

# Retention cleanup
npm run retention -- bagrot
npm run retention

# Daemon (nightly cron from BACKUP_CRON)
npm start
```

## Docker (recommended on VPS)

```bash
# From repo root
docker compose -f docker/docker-compose.yml up -d --build

# Manual backup inside the container
docker compose -f docker/docker-compose.yml exec backup-service \
  node dist/src/index.js backup bagrot
```

Site configs are compiled into the image at build time. After adding or editing a site file, rebuild:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

## Render Cron Job

Deploy as a **Cron Job** using the existing Docker image. Native Node on Render is **not** supported: the runtime does not include `mongodump`, and this service requires MongoDB Database Tools (already installed in [`docker/Dockerfile`](docker/Dockerfile)).

### Dashboard settings

| Setting | Value |
|---------|-------|
| Service type | Cron Job |
| Runtime | Docker |
| Dockerfile path | `docker/Dockerfile` (build context: repo root) |
| Docker Command | `node dist/src/index.js backup-all` |
| Schedule | e.g. `0 2 * * *` (UTC) — set in the Render dashboard |

Do **not** use `npm start` or run the image without a command override. The default Docker `CMD` starts **daemon mode** (`node-cron`), which is for long-running VPS deployments and does not exit.

### Command

```bash
node dist/src/index.js backup-all
```

This runs every enabled site once, uploads to R2, enforces retention, then exits. If any site fails, the process exits with a non-zero status so Render marks the run as failed.

### `BACKUP_CRON` vs Render schedule

- `BACKUP_CRON` is used only in **daemon mode** (`npm start` / no CLI args).
- On Render Cron, the schedule is defined in the **Render dashboard**. `BACKUP_CRON` is ignored for that deployment.

### Required environment variables

Set these as Render secret env vars (same names as [`.env.example`](.env.example)):

| Variable | Purpose |
|----------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | Target R2 bucket |
| `BAGROT_MONGODB_URI` | MongoDB URI for bagrot (`uriEnv` in site config) |
| `SIDURAVODA_MONGODB_URI` | MongoDB URI for siduravoda |
| `GADASH_MONGODB_URI` | MongoDB URI for gadash |
| `STORAGE_PROVIDER` | Optional; default `r2` |

Add more `*_MONGODB_URI` values whenever you add a site config.

### Cloudflare R2

1. Create an R2 bucket (or reuse an existing one).
2. Create an API token with Object Read & Write on that bucket.
3. Put account id, access key, secret, and bucket name into the Render env vars above.

### MongoDB Atlas network access

Render Cron containers use public outbound IPs. On lower plans those IPs are often **not static**.

- Allowlist Render’s outbound IPs if you have static egress, **or**
- Temporarily allow `0.0.0.0/0` in Atlas Network Access (least preferred), **or**
- Use a Render plan / setup that provides static outbound IPs and allowlist those.

Atlas database users need at least `read` on each target database.

### After deploy

1. Push site configs under `config/sites/*.ts` (they are baked into the image at build time).
2. Trigger a manual run from the Render dashboard to verify logs and R2 uploads.
3. Confirm a failed site produces a failed cron run (non-zero exit).

## R2 object layout

```
backups/
├── bagrot/2026-07-15T020001Z.archive.gz
├── bagrot/2026-07-15T020001Z.meta.json
└── siduravoda/...
```

### Metadata (`schemaVersion` / `backupVersion`)

Every `.meta.json` includes:

| Field | Purpose |
|-------|---------|
| `schemaVersion` | How to parse the metadata JSON |
| `backupVersion` | How to restore the archive blob |
| `checksumSha256` | Integrity check before restore |
| `storagePath` | Archive key in R2 |
| `sizeBytes`, `createdAt`, `database`, `siteId` | Inventory / retention |

Both version fields start at `1`. Future metadata shape changes bump `schemaVersion`; archive format changes bump `backupVersion`.

## Manual restore (v1)

Restore is intentional and rare — not automated yet.

```bash
# 1. Download from R2 (aws CLI works with R2 endpoint)
aws s3 cp s3://backups/bagrot/2026-07-15T020001Z.archive.gz . \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
aws s3 cp s3://backups/bagrot/2026-07-15T020001Z.meta.json . \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"

# 2. Verify checksum
sha256sum 2026-07-15T020001Z.archive.gz
# Compare with checksumSha256 in the .meta.json file

# 3. Confirm backupVersion is 1, then restore
# Prefer a staging URI first!
mongorestore \
  --uri="$BAGROT_MONGODB_URI" \
  --archive=2026-07-15T020001Z.archive.gz \
  --gzip \
  --drop
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKUP_CRON` | No | Daemon mode only (default `0 2 * * *`). Ignored by Render Cron — set the schedule in the Render dashboard instead. |
| `STORAGE_PROVIDER` | No | Default `r2` |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | Yes | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 API token secret |
| `R2_BUCKET_NAME` | Yes | Target bucket |
| `*_MONGODB_URI` | Per site | Values for each site's `uriEnv` |

## Onboarding a new website

1. Create `config/sites/<id>.ts` (copy an example)
2. Add the matching `*_MONGODB_URI` to `.env`
3. Allowlist VPS IP in Atlas (if needed)
4. Rebuild / restart the service
5. Test: `npm run backup -- <id>` or the Docker `exec` equivalent

## Future (not in v1)

- Automated restore CLI (`backupVersion`-aware)
- GCS / S3 storage providers
- Failure webhooks
- Client-side encryption (`backupVersion: 2`)
