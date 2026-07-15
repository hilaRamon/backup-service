/**
 * Resolve a required environment variable or throw a clear error.
 * Never log the value (may be a secret).
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getEnv(name: string, fallback?: string): string | undefined {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    return fallback
  }
  return value
}
