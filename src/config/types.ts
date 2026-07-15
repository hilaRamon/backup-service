export interface SiteConfig {
  /** Stable site identifier; used as R2 prefix and in CLI/logs. */
  id: string
  /** MongoDB database name passed to mongodump --db. */
  database: string
  /** Environment variable NAME that holds the MongoDB URI (never the URI itself). */
  uriEnv: string
  /** Delete backups older than this many days. */
  retentionDays: number
  /** When false, site is skipped without removing the config file. */
  enabled: boolean
}

export interface BackupMetadata {
  schemaVersion: number
  backupVersion: number
  siteId: string
  database: string
  createdAt: string
  sizeBytes: number
  checksumSha256: string
  storagePath: string
  mongodumpVersion: string
}
