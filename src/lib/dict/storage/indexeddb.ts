import { FileStorage, FileReader } from "./interfaces";
import { BlobFileReader } from "./blob-file-reader";
import { ProgressTracker } from "./progress-tracker";

/**
 * IndexedDB implementation of FileStorage.
 * Used as fallback when OPFS is unavailable (e.g., Firefox private mode).
 */
export class IndexedDBStorage implements FileStorage {
  private static readonly CACHE_VERSION = "v1";
  private static readonly DB_NAME = "tanoko-dictionaries";
  private static readonly DB_VERSION = 1;
  private static readonly FILE_STORE = "files";
  private static readonly METADATA_STORE = "metadata";

  private db: IDBDatabase | undefined;

  constructor(private dirName: string) {}

  async initialize(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IndexedDBStorage.DB_NAME, IndexedDBStorage.DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;

        // Create file store if it doesn't exist
        if (!db.objectStoreNames.contains(IndexedDBStorage.FILE_STORE)) {
          db.createObjectStore(IndexedDBStorage.FILE_STORE);
        }

        // Create metadata store if it doesn't exist
        if (!db.objectStoreNames.contains(IndexedDBStorage.METADATA_STORE)) {
          db.createObjectStore(IndexedDBStorage.METADATA_STORE);
        }
      };
    });
  }

  async ensureFileExists(
    filename: string,
    url: string,
    progressTracker?: ProgressTracker,
  ): Promise<FileReader> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    const fileKey = `${this.dirName}/${filename}`;
    const metaKey = `${this.dirName}/${filename}.meta`;

    let needsDownload = false;

    try {
      // Check if file exists and if metadata indicates it needs updating
      const metadata = await this.getMetadata(metaKey);
      if (metadata) {
        const [storedVersion, storedUrl] = metadata.split("\n");
        needsDownload = storedVersion !== IndexedDBStorage.CACHE_VERSION || storedUrl !== url;
      } else {
        needsDownload = true;
      }

      // Also check if the actual file exists
      if (!needsDownload) {
        const fileExists = await this.fileExists(fileKey);
        if (!fileExists) {
          needsDownload = true;
        }
      }
    } catch {
      needsDownload = true;
    }

    if (needsDownload) {
      await this.downloadFile(fileKey, url, progressTracker);
      await this.saveMetadata(metaKey, url);
    }

    return this.getFileReader(filename);
  }

  private async getFileReader(filename: string): Promise<FileReader> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    const fileKey = `${this.dirName}/${filename}`;
    const blob = await this.getFile(fileKey);

    if (!blob) {
      throw new Error(`File not found: ${filename}`);
    }

    return new BlobFileReader(blob);
  }

  async clearAll(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(
      [IndexedDBStorage.FILE_STORE, IndexedDBStorage.METADATA_STORE],
      "readwrite",
    );
    const fileStore = transaction.objectStore(IndexedDBStorage.FILE_STORE);
    const metadataStore = transaction.objectStore(IndexedDBStorage.METADATA_STORE);

    // Get all keys and delete those that match our directory prefix
    const prefix = `${this.dirName}/`;

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      // Clear files
      const fileRequest = fileStore.getAllKeys();
      fileRequest.onsuccess = () => {
        const keys = fileRequest.result as string[];
        for (const key of keys) {
          if (key.startsWith(prefix)) {
            fileStore.delete(key);
          }
        }
      };

      // Clear metadata
      const metaRequest = metadataStore.getAllKeys();
      metaRequest.onsuccess = () => {
        const keys = metaRequest.result as string[];
        for (const key of keys) {
          if (key.startsWith(prefix)) {
            metadataStore.delete(key);
          }
        }
      };
    });
  }

  private async downloadFile(
    fileKey: string,
    url: string,
    progressTracker?: ProgressTracker,
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`);
    }

    // Read the response as chunks and track progress
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        totalBytes += value.byteLength;

        if (progressTracker) {
          progressTracker.addBytes(value.byteLength);
        }
      }
    } finally {
      if (progressTracker) {
        progressTracker.finish();
      }
      reader.releaseLock();
    }

    // Combine chunks into a single Uint8Array and create a Blob
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const blob = new Blob([combined]);
    await this.saveFile(fileKey, blob);
  }

  private async saveFile(key: string, blob: Blob): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.FILE_STORE], "readwrite");
      const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);
      const request = store.put(blob, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getFile(key: string): Promise<Blob | null> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.FILE_STORE], "readonly");
      const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async fileExists(key: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.FILE_STORE], "readonly");
      const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);
      const request = store.count(key);

      request.onsuccess = () => {
        resolve(request.result > 0);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async saveMetadata(key: string, url: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    const metadata = `${IndexedDBStorage.CACHE_VERSION}\n${url}`;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.METADATA_STORE], "readwrite");
      const store = transaction.objectStore(IndexedDBStorage.METADATA_STORE);
      const request = store.put(metadata, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getMetadata(key: string): Promise<string | null> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.METADATA_STORE], "readonly");
      const store = transaction.objectStore(IndexedDBStorage.METADATA_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
