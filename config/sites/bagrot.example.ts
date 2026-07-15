import type { SiteConfig } from '../../src/config/types.js'

/**
 * Copy this file to bagrot.ts (without .example) and adjust fields.
 * Secrets stay in env — only the variable *name* belongs here.
 */
export const site: SiteConfig = {
  id: 'bagrot',
  database: 'bagrot_production',
  uriEnv: 'BAGROT_MONGODB_URI',
  retentionDays: 30,
  enabled: true,
}
