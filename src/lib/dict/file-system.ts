export class ProgressTracker {
  private totalBytes = 0;
  private lastReportedBytes = 0;
  private readonly chunkSize: number;

  constructor(
    private onProgress?: (bytesDownloaded: number) => void,
    chunkSize: number = 1024 * 100, // Default 100KB chunks
  ) {
    this.chunkSize = chunkSize;
  }

  /**
   * Add bytes to the total and potentially trigger a progress update.
   */
  addBytes(bytes: number): void {
    this.totalBytes += bytes;

    if (this.shouldReport()) {
      this.reportProgress();
    }
  }

  /**
   * Force a final progress report, useful when download is complete.
   */
  finish(): void {
    if (this.totalBytes !== this.lastReportedBytes) {
      this.reportProgress();
    }
  }

  /**
   * Get the current total bytes without triggering a progress report.
   */
  getCurrentBytes(): number {
    return this.totalBytes;
  }

  private shouldReport(): boolean {
    return this.totalBytes - this.lastReportedBytes >= this.chunkSize;
  }

  private reportProgress(): void {
    if (this.onProgress) {
      this.onProgress(this.totalBytes);
      this.lastReportedBytes = this.totalBytes;
    }
  }
}

export class FileSystem {
  private static readonly CACHE_VERSION = "v1";

  private dictDir: FileSystemDirectoryHandle | undefined;

  constructor(private dirName: string) {}

  async initialize(): Promise<void> {
    if (this.dictDir) return;
    const opfsRoot = await navigator.storage.getDirectory();
    this.dictDir = await opfsRoot.getDirectoryHandle(this.dirName, { create: true });
  }

  async ensureFileExists(
    filename: string,
    url: string,
    progressTracker?: ProgressTracker,
  ): Promise<FileSystemFileHandle> {
    if (!this.dictDir) {
      throw new Error("FileSystem not initialized");
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
        needsDownload = storedVersion !== FileSystem.CACHE_VERSION || storedUrl !== url;
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

    return this.dictDir.getFileHandle(filename);
  }

  async getFileHandle(filename: string): Promise<FileSystemFileHandle> {
    if (!this.dictDir) {
      throw new Error("FileSystem not initialized");
    }
    return this.dictDir.getFileHandle(filename);
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
    await writer.write(`${FileSystem.CACHE_VERSION}\n${url}`);
    await writer.close();
  }
}
