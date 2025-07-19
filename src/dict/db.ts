import { openDB } from "idb";

export type DictDbSchema = {
  jmdict: {
    key: string;
    value: string;
  };
  kanjidic: {
    key: string;
    value: string;
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

      if (!db.objectStoreNames.contains("kanjidic")) {
        db.createObjectStore("kanjidic");
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    },
  });
}
