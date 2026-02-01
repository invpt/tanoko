import { FileStorage } from "./interfaces";
import { OPFSStorage } from "./opfs";
import { IndexedDBStorage } from "./indexeddb";

export class StorageFactory {
  private static instance: FileStorage | null = null;

  static async getStorage(): Promise<FileStorage> {
    if (this.instance) {
      return this.instance;
    }

    let storage: FileStorage;

    if (await this.isOPFSAvailable()) {
      try {
        storage = await OPFSStorage.create();
        console.log("Using OPFS for file storage");
      } catch (error) {
        console.warn("OPFS initialization failed, falling back to IndexedDB:", error);
        storage = await IndexedDBStorage.create();
      }
    } else {
      console.log("OPFS not available, using IndexedDB for file storage");
      storage = await IndexedDBStorage.create();
    }

    this.instance = storage;
    return storage;
  }

  static clearCache(): void {
    this.instance = null;
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
}
