function timestamp(): string {
  return new Date().toISOString()
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.log(`[${timestamp()}] INFO  ${message}`, meta)
    } else {
      console.log(`[${timestamp()}] INFO  ${message}`)
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.warn(`[${timestamp()}] WARN  ${message}`, meta)
    } else {
      console.warn(`[${timestamp()}] WARN  ${message}`)
    }
  },

  error(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.error(`[${timestamp()}] ERROR ${message}`, meta)
    } else {
      console.error(`[${timestamp()}] ERROR ${message}`)
    }
  },
}
