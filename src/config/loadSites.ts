import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { SiteConfig } from './types.js'
import { logger } from '../lib/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function sitesDir(): string {
  // dist/src/config → dist/config/sites  |  src/config → config/sites
  return path.resolve(__dirname, '../../config/sites')
}

function isSiteModule(filename: string): boolean {
  if (filename.includes('.example.')) return false
  if (filename.endsWith('.d.ts') || filename.endsWith('.d.ts.map')) return false
  if (filename.endsWith('.js.map')) return false
  return filename.endsWith('.ts') || filename.endsWith('.js')
}

function isSiteConfig(value: unknown): value is SiteConfig {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.database === 'string' &&
    typeof c.uriEnv === 'string' &&
    typeof c.retentionDays === 'number' &&
    typeof c.enabled === 'boolean'
  )
}

/**
 * Auto-discovers every site config under config/sites/.
 * Skips *.example.* files. Returns all sites, or only enabled when filterEnabled is true.
 */
export async function loadSites(options?: {
  filterEnabled?: boolean
}): Promise<SiteConfig[]> {
  const dir = sitesDir()
  let entries: string[]

  try {
    entries = await readdir(dir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      logger.warn(`Sites directory not found: ${dir}`)
      return []
    }
    throw err
  }

  const sites: SiteConfig[] = []

  for (const filename of entries) {
    if (!isSiteModule(filename)) continue

    // Prefer .js when both exist (compiled layout); skip .ts if .js sibling present
    if (filename.endsWith('.ts')) {
      const jsSibling = filename.replace(/\.ts$/, '.js')
      if (entries.includes(jsSibling)) continue
    }

    const fullPath = path.join(dir, filename)
    const mod = (await import(pathToFileURL(fullPath).href)) as {
      site?: unknown
    }

    if (!isSiteConfig(mod.site)) {
      throw new Error(
        `Invalid site config export in ${filename}: expected \`export const site: SiteConfig\``,
      )
    }

    sites.push(mod.site)
  }

  sites.sort((a, b) => a.id.localeCompare(b.id))

  const seen = new Set<string>()
  for (const site of sites) {
    if (seen.has(site.id)) {
      throw new Error(`Duplicate site id: ${site.id}`)
    }
    seen.add(site.id)
  }

  if (options?.filterEnabled !== false) {
    return sites.filter((s) => s.enabled)
  }

  return sites
}

export async function findSite(siteId: string): Promise<SiteConfig> {
  const sites = await loadSites({ filterEnabled: false })
  const site = sites.find((s) => s.id === siteId)
  if (!site) {
    const known = sites.map((s) => s.id).join(', ') || '(none)'
    throw new Error(`Unknown site "${siteId}". Known sites: ${known}`)
  }
  if (!site.enabled) {
    throw new Error(`Site "${siteId}" is disabled (enabled: false)`)
  }
  return site
}
