import { writeFile } from 'node:fs/promises'
import {
  CURRENT_BACKUP_VERSION,
  CURRENT_SCHEMA_VERSION,
} from '../constants.js'
import type { BackupMetadata } from '../config/types.js'

export interface BuildMetadataInput {
  siteId: string
  database: string
  createdAt: Date
  sizeBytes: number
  checksumSha256: string
  storagePath: string
  mongodumpVersion: string
}

export function buildMetadata(input: BuildMetadataInput): BackupMetadata {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    backupVersion: CURRENT_BACKUP_VERSION,
    siteId: input.siteId,
    database: input.database,
    createdAt: input.createdAt.toISOString(),
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    storagePath: input.storagePath,
    mongodumpVersion: input.mongodumpVersion,
  }
}

export async function writeMetadataFile(
  metaPath: string,
  metadata: BackupMetadata,
): Promise<void> {
  await writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}
