import type { SiteConfig } from '../../src/config/types.js'

export const site: SiteConfig = {
  id: 'siduravoda',
  database: 'siduravoda_production',
  uriEnv: 'SIDURAVODA_MONGODB_URI',
  retentionDays: 30,
  enabled: true,
}
