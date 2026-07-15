import { getEnv } from '../lib/env.js'
import type { StorageProvider } from './StorageProvider.js'
import { createR2Storage } from './r2.js'

export function createStorage(): StorageProvider {
  const provider = (getEnv('STORAGE_PROVIDER', 'r2') ?? 'r2').toLowerCase()

  switch (provider) {
    case 'r2':
      return createR2Storage()
    default:
      throw new Error(
        `Unsupported STORAGE_PROVIDER "${provider}". Supported in v1: r2`,
      )
  }
}
