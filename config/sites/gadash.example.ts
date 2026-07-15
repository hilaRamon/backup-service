import type { SiteConfig } from '../../src/config/types.js'

export const site: SiteConfig = {
  id: 'gadash',
  database: 'gadash_production',
  uriEnv: 'GADASH_MONGODB_URI',
  retentionDays: 30,
  enabled: true,
}
