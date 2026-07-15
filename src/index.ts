import 'dotenv/config'
import cron from 'node-cron'
import { DEFAULT_BACKUP_CRON } from './constants.js'
import { runCli } from './cli.js'
import { loadSites } from './config/loadSites.js'
import { runBackup } from './backup/runBackup.js'
import { createStorage } from './storage/createStorage.js'
import { getEnv } from './lib/env.js'
import { logger } from './lib/logger.js'

async function runScheduledBackups(): Promise<void> {
  const sites = await loadSites({ filterEnabled: true })
  if (sites.length === 0) {
    logger.warn('Scheduled run: no enabled sites found')
    return
  }

  const storage = createStorage()
  logger.info(`Scheduled run: ${sites.length} site(s)`, {
    sites: sites.map((s) => s.id),
  })

  for (const site of sites) {
    try {
      await runBackup(site, storage)
    } catch (err) {
      logger.error(`Scheduled backup failed for ${site.id}`, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

async function startDaemon(): Promise<void> {
  const expression = getEnv('BACKUP_CRON', DEFAULT_BACKUP_CRON) ?? DEFAULT_BACKUP_CRON

  if (!cron.validate(expression)) {
    throw new Error(`Invalid BACKUP_CRON expression: ${expression}`)
  }

  const sites = await loadSites({ filterEnabled: false })
  logger.info('Backup service starting (daemon mode)', {
    cron: expression,
    configuredSites: sites.map((s) => ({
      id: s.id,
      enabled: s.enabled,
    })),
  })

  let running = false

  cron.schedule(expression, () => {
    if (running) {
      logger.warn('Previous backup run still in progress; skipping tick')
      return
    }
    running = true
    void runScheduledBackups()
      .catch((err: unknown) => {
        logger.error('Scheduled run crashed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        running = false
      })
  })

  logger.info(`Cron registered: ${expression}`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length > 0) {
    await runCli(args)
    return
  }

  await startDaemon()
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
