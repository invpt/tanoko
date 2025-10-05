import { FileStorage, FileReader } from "./interfaces";
import { BlobFileReader } from "./blob-file-reader";
import { ProgressTracker } from "./progress-tracker";

/**
 * OPFS (Origin Private File System) implementation of FileStorage.
 * Uses the browser's private file system for efficient file storage and access.
 */
export class OPFSStorage implements FileStorage {
  private static readonly DIR_NAME = "dictionaries";
  private dictDir: FileSystemDirectoryHandle | undefined;

  constructor() {}

  async initialize(): Promise<void> {
    if (this.dictDir) return;

    try {
      const opfsRoot = await navigator.storage.getDirectory();
      this.dictDir = await opfsRoot.getDirectoryHandle(OPFSStorage.DIR_NAME, { create: true });
    } catch (error) {
      throw new Error(`Failed to initialize OPFS: ${error}`);
    }
  }

  async ensureFileExists(
    filename: string,
    url: string,
    progressTracker?: ProgressTracker,
  ): Promise<FileReader> {
    if (!this.dictDir) {
      throw new Error("OPFSStorage not initialized");
    }

    // Check if file exists
    let fileExists = false;
    try {
      await this.dictDir.getFileHandle(filename);
      fileExists = true;
    } catch {
      // File doesn't exist
    }

    if (!fileExists) {
      await this.downloadFile(filename, url, progressTracker);
    }

    return this.getFileReader(filename);
  }

  private async getFileReader(filename: string): Promise<FileReader> {
    if (!this.dictDir) {
      throw new Error("OPFSStorage not initialized");
    }

    try {
      const fileHandle = await this.dictDir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return new BlobFileReader(file);
    } catch (error) {
      throw new Error(`File not found: ${filename}`);
    }
  }

  async clearAll(): Promise<void> {
    const opfsRoot = await navigator.storage.getDirectory();
    try {
      await opfsRoot.removeEntry(OPFSStorage.DIR_NAME, { recursive: true });
    } catch {
      // Directory might not exist
    }
    this.dictDir = undefined;
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

    const fileHandle = await this.dictDir!.getFileHandle(filename, { create: true });
    const writer = await fileHandle.createWritable();
    const reader = response.body!.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writer.write(value);

        if (progressTracker && value) {
          progressTracker.addBytes(value.byteLength);
        }
      }
    } finally {
      if (progressTracker) {
        progressTracker.finish();
      }

      await writer.close();
      reader.releaseLock();
    }
  }
}
