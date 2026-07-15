import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  ARCHIVE_EXTENSION,
  META_EXTENSION,
} from '../constants.js'
import type { SiteConfig } from '../config/types.js'
import { mongoDump } from '../dump/mongoDump.js'
import { requireEnv } from '../lib/env.js'
import { sha256File } from '../lib/checksum.js'
import { logger } from '../lib/logger.js'
import {
  buildMetadata,
  writeMetadataFile,
} from '../metadata/buildMetadata.js'
import type { StorageProvider } from '../storage/StorageProvider.js'
import { cleanupSiteRetention } from '../retention/cleanup.js'

function formatTimestamp(date: Date): string {
  // 2026-07-15T02:00:01.000Z → 2026-07-15T020001Z
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '')
}

export interface RunBackupResult {
  siteId: string
  storagePath: string
  checksumSha256: string
  sizeBytes: number
}

export async function runBackup(
  site: SiteConfig,
  storage: StorageProvider,
  options?: { runRetention?: boolean },
): Promise<RunBackupResult> {
  const uri = requireEnv(site.uriEnv)
  const createdAt = new Date()
  const timestamp = formatTimestamp(createdAt)
  const storagePath = `${site.id}/${timestamp}${ARCHIVE_EXTENSION}`
  const metaStoragePath = `${site.id}/${timestamp}${META_EXTENSION}`

  const tempDir = await mkdtemp(path.join(tmpdir(), `backup-${site.id}-`))
  const archivePath = path.join(tempDir, `${timestamp}${ARCHIVE_EXTENSION}`)
  const metaPath = path.join(tempDir, `${timestamp}${META_EXTENSION}`)

  logger.info('Backup started', { siteId: site.id, database: site.database })

  try {
    const dump = await mongoDump({
      uri,
      database: site.database,
      archivePath,
    })

    const { checksumSha256, sizeBytes } = await sha256File(archivePath)

    const metadata = buildMetadata({
      siteId: site.id,
      database: site.database,
      createdAt,
      sizeBytes,
      checksumSha256,
      storagePath,
      mongodumpVersion: dump.mongodumpVersion,
    })

    await writeMetadataFile(metaPath, metadata)

    await storage.put(storagePath, archivePath, 'application/gzip')
    await storage.put(metaStoragePath, metaPath, 'application/json')

    logger.info('Backup completed', {
      siteId: site.id,
      storagePath,
      sizeBytes,
      checksumSha256,
    })

    if (options?.runRetention !== false) {
      await cleanupSiteRetention(site, storage)
    }

    return {
      siteId: site.id,
      storagePath,
      checksumSha256,
      sizeBytes,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
