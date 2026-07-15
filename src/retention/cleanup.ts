import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  ARCHIVE_EXTENSION,
  META_EXTENSION,
} from '../constants.js'
import type { BackupMetadata, SiteConfig } from '../config/types.js'
import { logger } from '../lib/logger.js'
import type { StorageProvider } from '../storage/StorageProvider.js'

interface BackupGroup {
  stem: string
  archiveKey?: string
  metaKey?: string
}

/**
 * Delete R2 backup pairs older than site.retentionDays.
 */
export async function cleanupSiteRetention(
  site: SiteConfig,
  storage: StorageProvider,
): Promise<number> {
  const prefix = `${site.id}/`
  const objects = await storage.list(prefix)
  const groups = groupByStem(objects.map((o) => o.key))

  const cutoff = Date.now() - site.retentionDays * 24 * 60 * 60 * 1000
  let deleted = 0

  for (const group of groups.values()) {
    const createdAt = await resolveCreatedAt(storage, group)
    if (createdAt === null) {
      logger.warn('Skipping retention group with unparseable age', {
        siteId: site.id,
        stem: group.stem,
      })
      continue
    }

    if (createdAt.getTime() >= cutoff) continue

    if (group.archiveKey) {
      await storage.delete(group.archiveKey)
      deleted++
    }
    if (group.metaKey) {
      await storage.delete(group.metaKey)
      deleted++
    }

    logger.info('Deleted expired backup', {
      siteId: site.id,
      stem: group.stem,
      createdAt: createdAt.toISOString(),
    })
  }

  if (deleted > 0) {
    logger.info('Retention cleanup finished', {
      siteId: site.id,
      deletedObjects: deleted,
      retentionDays: site.retentionDays,
    })
  }

  return deleted
}

function groupByStem(keys: string[]): Map<string, BackupGroup> {
  const groups = new Map<string, BackupGroup>()

  for (const key of keys) {
    const filename = key.includes('/')
      ? key.slice(key.lastIndexOf('/') + 1)
      : key
    let stem: string | null = null
    let kind: 'archive' | 'meta' | null = null

    if (filename.endsWith(ARCHIVE_EXTENSION)) {
      stem = filename.slice(0, -ARCHIVE_EXTENSION.length)
      kind = 'archive'
    } else if (filename.endsWith(META_EXTENSION)) {
      stem = filename.slice(0, -META_EXTENSION.length)
      kind = 'meta'
    }

    if (!stem || !kind) continue

    const existing = groups.get(stem) ?? { stem }
    if (kind === 'archive') existing.archiveKey = key
    if (kind === 'meta') existing.metaKey = key
    groups.set(stem, existing)
  }

  return groups
}

async function resolveCreatedAt(
  storage: StorageProvider,
  group: BackupGroup,
): Promise<Date | null> {
  if (group.metaKey) {
    const dir = await mkdtemp(path.join(tmpdir(), 'backup-meta-'))
    const dest = path.join(dir, 'meta.json')
    try {
      await storage.get(group.metaKey, dest)
      const raw = await readFile(dest, 'utf8')
      const meta = JSON.parse(raw) as BackupMetadata
      if (meta.createdAt) {
        const d = new Date(meta.createdAt)
        if (!Number.isNaN(d.getTime())) return d
      }
    } catch (err) {
      logger.warn('Failed to read metadata for retention; falling back to key', {
        metaKey: group.metaKey,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  return parseTimestampFromStem(group.stem)
}

/**
 * Parse stem like 2026-07-15T020001Z into a Date.
 */
export function parseTimestampFromStem(stem: string): Date | null {
  const m = stem.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return null

  const [, y, mo, d, h, mi, s] = m
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}
