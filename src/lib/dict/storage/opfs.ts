import { FileStorage, FileReader } from "./interfaces";
import { BlobFileReader } from "./blob-file-reader";
import { ProgressTracker } from "./progress-tracker";

/**
 * OPFS (Origin Private File System) implementation of FileStorage.
 * Uses the browser's private file system for efficient file storage and access.
 */
export class OPFSStorage implements FileStorage {
  private static readonly CACHE_VERSION = "v1";
  private dictDir: FileSystemDirectoryHandle | undefined;

  constructor(private dirName: string) {}

  async initialize(): Promise<void> {
    if (this.dictDir) return;

    try {
      const opfsRoot = await navigator.storage.getDirectory();
      this.dictDir = await opfsRoot.getDirectoryHandle(this.dirName, { create: true });
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

    let needsDownload = false;

    try {
      await this.dictDir.getFileHandle(filename);

      // Check if we need to update based on cache version
      const metadataHandle = await this.dictDir.getFileHandle(`${filename}.meta`).catch(() => null);
      if (metadataHandle) {
        const metadataFile = await metadataHandle.getFile();
        const metadata = await metadataFile.text();
        const [storedVersion, storedUrl] = metadata.split("\n");
        needsDownload = storedVersion !== OPFSStorage.CACHE_VERSION || storedUrl !== url;
      } else {
        needsDownload = true;
      }
    } catch {
      needsDownload = true;
    }

    if (needsDownload) {
      await this.downloadFile(filename, url, progressTracker);
      await this.saveMetadata(filename, url);
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
      await opfsRoot.removeEntry(this.dirName, { recursive: true });
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

  private async saveMetadata(filename: string, url: string): Promise<void> {
    const metadataHandle = await this.dictDir!.getFileHandle(`${filename}.meta`, {
      create: true,
    });
    const writer = await metadataHandle.createWritable();
    await writer.write(`${OPFSStorage.CACHE_VERSION}\n${url}`);
    await writer.close();
  }
}
