import { ProgressTracker } from "./progress-tracker";

export interface FileReader {
  read(start?: number, end?: number): Promise<ArrayBuffer>;
  stream(): Promise<ReadableStream>;
}

export interface FileStorage {
  ensureFileExists(
    filename: string,
    url: string,
    progressTracker?: ProgressTracker,
  ): Promise<FileReader>;
  clearAll(): Promise<void>;
}
