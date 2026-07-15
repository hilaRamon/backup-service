import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { StorageObject, StorageProvider } from './StorageProvider.js'
import { requireEnv } from '../lib/env.js'
import { logger } from '../lib/logger.js'

export function createR2Storage(): StorageProvider {
  const accountId = requireEnv('R2_ACCOUNT_ID')
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
  const bucket = requireEnv('R2_BUCKET_NAME')

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return {
    async put(
      key: string,
      filePath: string,
      contentType = 'application/octet-stream',
    ): Promise<void> {
      const { size } = await stat(filePath)
      logger.info('Uploading to R2', { key, bucket, sizeBytes: size })
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: size,
          ContentType: contentType,
        }),
      )
    },

    async get(key: string, destPath: string): Promise<void> {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )

      if (!response.Body) {
        throw new Error(`Empty body for R2 object: ${key}`)
      }

      const body = response.Body as Readable
      await pipeline(body, createWriteStream(destPath))
    },

    async list(prefix: string): Promise<StorageObject[]> {
      const objects: StorageObject[] = []
      let continuationToken: string | undefined

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        )

        for (const item of response.Contents ?? []) {
          if (!item.Key) continue
          objects.push({
            key: item.Key,
            sizeBytes: item.Size,
            lastModified: item.LastModified,
          })
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined
      } while (continuationToken)

      return objects
    },

    async delete(key: string): Promise<void> {
      logger.info('Deleting from R2', { key, bucket })
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )
    },
  }
}
