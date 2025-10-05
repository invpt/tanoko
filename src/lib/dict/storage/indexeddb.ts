import { FileStorage, FileReader } from "./interfaces";
import { BlobFileReader } from "./blob-file-reader";
import { ProgressTracker } from "./progress-tracker";

/**
 * IndexedDB implementation of FileStorage.
 * Used as fallback when OPFS is unavailable (e.g., Firefox private mode).
 */
export class IndexedDBStorage implements FileStorage {
  private static readonly DB_NAME = "tanoko-dictionaries";
  private static readonly DB_VERSION = 1;
  private static readonly FILE_STORE = "files";

  private db: IDBDatabase | undefined;

  constructor() {}

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

    // Check if file exists
    const fileExists = await this.fileExists(filename);

    if (!fileExists) {
      await this.downloadFile(filename, url, progressTracker);
    }

    return this.getFileReader(filename);
  }

  private async getFileReader(filename: string): Promise<FileReader> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    const blob = await this.getFile(filename);

    if (!blob) {
      throw new Error(`File not found: ${filename}`);
    }

    return new BlobFileReader(blob);
  }

  async clearAll(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([IndexedDBStorage.FILE_STORE], "readwrite");
    const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      // Clear all files
      const request = store.clear();
      request.onerror = () => reject(request.error);
    });
  }

  private async downloadFile(
    filename: string,
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
    await this.saveFile(filename, blob);
  }

  private async saveFile(filename: string, blob: Blob): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.FILE_STORE], "readwrite");
      const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);
      const request = store.put(blob, filename);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getFile(filename: string): Promise<Blob | null> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.FILE_STORE], "readonly");
      const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);
      const request = store.get(filename);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async fileExists(filename: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("IndexedDBStorage not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBStorage.FILE_STORE], "readonly");
      const store = transaction.objectStore(IndexedDBStorage.FILE_STORE);
      const request = store.count(filename);

      request.onsuccess = () => {
        resolve(request.result > 0);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
