import { openDB } from "idb";

export type DictDbSchema = {
  jmdict: {
    key: number;
    value: { ref: string; data: Uint8Array };
  };
  cedict: {
    key: number;
    value: { ref: string; data: Uint8Array };
  };
  meta: {
    key: string;
    value: string;
  };
};

export async function openDictDb() {
  return await openDB<DictDbSchema>("tanoko", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("jmdict")) {
        db.createObjectStore("jmdict");
      }

      if (!db.objectStoreNames.contains("cedict")) {
        db.createObjectStore("cedict");
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    },
  });
}
