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

  addBytes(bytes: number): void {
    this.totalBytes += bytes;

    if (this.shouldReport()) {
      this.reportProgress();
    }
  }

  finish(): void {
    if (this.totalBytes !== this.lastReportedBytes) {
      this.reportProgress();
    }
  }

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
