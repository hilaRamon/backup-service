import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

export interface ChecksumResult {
  checksumSha256: string
  sizeBytes: number
}

/** Compute SHA-256 of a file (streaming) and return size. */
export async function sha256File(filePath: string): Promise<ChecksumResult> {
  const sizeBytes = (await stat(filePath)).size
  const hash = createHash('sha256')

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk: string | Buffer) => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })

  return {
    checksumSha256: hash.digest('hex'),
    sizeBytes,
  }
}
