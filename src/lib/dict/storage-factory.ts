import { FileStorage } from "./storage-interfaces";
import { OPFSStorage } from "./opfs-storage";
import { IndexedDBStorage } from "./indexeddb-storage";

export class StorageFactory {
  private static storageCache = new Map<string, FileStorage>();

  static async createStorage(dirName: string): Promise<FileStorage> {
    // Return cached instance if available
    const cached = this.storageCache.get(dirName);
    if (cached) {
      return cached;
    }

    let storage: FileStorage;

    if (await this.isOPFSAvailable()) {
      try {
        storage = new OPFSStorage(dirName);
        await storage.initialize();
        console.log("Using OPFS for file storage");
      } catch (error) {
        console.warn("OPFS initialization failed, falling back to IndexedDB:", error);
        storage = await this.createIndexedDBStorage(dirName);
      }
    } else {
      console.log("OPFS not available, using IndexedDB for file storage");
      storage = await this.createIndexedDBStorage(dirName);
    }

    // Cache the storage instance
    this.storageCache.set(dirName, storage);
    return storage;
  }

  static clearCache(): void {
    this.storageCache.clear();
  }

  private static async isOPFSAvailable(): Promise<boolean> {
    // Check basic API availability
    if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) {
      return false;
    }

    // Test actual functionality to catch Firefox private mode
    try {
      const opfsRoot = await navigator.storage.getDirectory();

      // Try to create a test directory and file to verify OPFS actually works
      const testDir = await opfsRoot.getDirectoryHandle("__opfs_test__", { create: true });
      const testFile = await testDir.getFileHandle("test.txt", { create: true });

      // Try to write to the file to ensure it's not just a facade
      const writer = await testFile.createWritable();
      await writer.write("test");
      await writer.close();

      // Clean up test files
      await testDir.removeEntry("test.txt");
      await opfsRoot.removeEntry("__opfs_test__");

      return true;
    } catch (error) {
      // OPFS appears available but throws errors (e.g., Firefox private mode)
      console.warn("OPFS test failed:", error);
      return false;
    }
  }

  private static async createIndexedDBStorage(dirName: string): Promise<FileStorage> {
    const storage = new IndexedDBStorage(dirName);
    await storage.initialize();
    return storage;
  }
}
