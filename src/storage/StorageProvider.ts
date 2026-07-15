export interface StorageObject {
  key: string
  sizeBytes?: number
  lastModified?: Date
}

export interface StorageProvider {
  put(key: string, filePath: string, contentType?: string): Promise<void>
  get(key: string, destPath: string): Promise<void>
  list(prefix: string): Promise<StorageObject[]>
  delete(key: string): Promise<void>
}
