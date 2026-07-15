import { findSite, loadSites } from './config/loadSites.js'
import { runBackup } from './backup/runBackup.js'
import { cleanupSiteRetention } from './retention/cleanup.js'
import { createStorage } from './storage/createStorage.js'
import { logger } from './lib/logger.js'

export async function runCli(argv: string[]): Promise<void> {
  const [command, siteId] = argv

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  switch (command) {
    case 'backup': {
      if (!siteId) {
        throw new Error('Usage: backup <siteId>')
      }
      const site = await findSite(siteId)
      const storage = createStorage()
      await runBackup(site, storage)
      break
    }

    case 'backup-all': {
      const sites = await loadSites({ filterEnabled: true })
      if (sites.length === 0) {
        logger.warn('No enabled sites found in config/sites/')
        return
      }
      const storage = createStorage()
      let failures = 0
      for (const site of sites) {
        try {
          await runBackup(site, storage)
        } catch (err) {
          failures++
          logger.error(`Backup failed for site ${site.id}`, {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      if (failures > 0) {
        throw new Error(`${failures} of ${sites.length} site backup(s) failed`)
      }
      break
    }

    case 'retention': {
      const storage = createStorage()
      if (siteId) {
        const site = await findSite(siteId)
        await cleanupSiteRetention(site, storage)
      } else {
        const sites = await loadSites({ filterEnabled: true })
        for (const site of sites) {
          await cleanupSiteRetention(site, storage)
        }
      }
      break
    }

    default:
      printHelp()
      throw new Error(`Unknown command: ${command}`)
  }
}

function printHelp(): void {
  console.log(`Usage:
  backup <siteId>       Run backup for one site
  backup-all            Run backup for all enabled sites
  retention [siteId]    Run retention cleanup (one site or all)

Daemon mode (no args): start nightly cron scheduler
`)
}
