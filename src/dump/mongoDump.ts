import { spawn } from 'node:child_process'
import { logger } from '../lib/logger.js'

export interface MongoDumpOptions {
  uri: string
  database: string
  /** Absolute path for the output .archive.gz file. */
  archivePath: string
}

export interface MongoDumpResult {
  archivePath: string
  mongodumpVersion: string
}

/**
 * Run mongodump --archive --gzip for a single database.
 * Never logs the full URI.
 */
export async function mongoDump(
  options: MongoDumpOptions,
): Promise<MongoDumpResult> {
  const { uri, database, archivePath } = options

  const args = [
    `--uri=${uri}`,
    `--db=${database}`,
    `--archive=${archivePath}`,
    '--gzip',
  ]

  logger.info('Starting mongodump', { database, archivePath })

  await runCommand('mongodump', args)
  const mongodumpVersion = await getMongodumpVersion()

  logger.info('mongodump completed', { database, mongodumpVersion })

  return { archivePath, mongodumpVersion }
}

async function getMongodumpVersion(): Promise<string> {
  try {
    const output = await runCommandCapture('mongodump', ['--version'])
    // First line typically: "mongodump version: 100.9.4"
    const match = output.match(/mongodump version:\s*(\S+)/i)
    return match?.[1] ?? output.split('\n')[0]?.trim() ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn ${command}: ${err.message}. Is mongodb-database-tools installed?`,
        ),
      )
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const safeStderr = redactUri(stderr)
      reject(
        new Error(
          `${command} exited with code ${code}${safeStderr ? `: ${safeStderr.trim()}` : ''}`,
        ),
      )
    })
  })
}

function runCommandCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout || stderr)
        return
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr}`))
    })
  })
}

/** Strip mongodb:// and mongodb+srv:// credentials from log output. */
function redactUri(text: string): string {
  return text
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://***REDACTED***')
}
