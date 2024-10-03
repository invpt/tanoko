import { IDBPDatabase, openDB } from "idb";

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

/** IMPORTANT: it will be wasteful if multiple instances of this function are running simultaneously */
export async function runImport(
  progressCallback?: (itemsImported: number) => void,
): Promise<number> {
  const db = await openDictDb();

  const totalJmdict = await importDsv(
    db,
    "jmdict",
    "/src/assets/gen/jmdict-words.txt",
    (n) => progressCallback?.(n),
  );

  return (
    totalJmdict +
    (await importDsv(
      db,
      "kanjidic",
      "/src/assets/gen/kanjidic-kanji.txt",
      (n) => progressCallback?.(totalJmdict + n),
    ))
  );
}

async function importDsv(
  db: IDBPDatabase<DictDbSchema>,
  storeName: "jmdict" | "kanjidic",
  src: string,
  progressCallback: (itemsImported: number) => void,
): Promise<number> {
  if ((await db.get("meta", storeName)) === src) {
    return await db.count(storeName);
  }

  progressCallback(0);

  const resp = await fetch(src);
  const reader = resp.body?.getReader();
  if (reader == null) {
    throw new Error("Response must have a body");
  }

  const decoder = new TextDecoder("utf-8");

  let imported = 0;
  let lastStatusUpdate = 0;
  const statusUpdate = () => {
    if (imported - lastStatusUpdate >= 10000) {
      progressCallback(imported);
      lastStatusUpdate = imported;
    }
  };

  let marginal = "";
  let completion = Promise.resolve();
  while (true) {
    const [result] = await Promise.all([
      reader.read(),
      completion.then(() => statusUpdate()),
    ]);

    if (result.done) {
      break;
    }

    const buf = result.value;

    let i = 0;
    const txn = db.transaction(storeName, "readwrite");
    completion = new Promise((resolve, reject) => {
      txn.oncomplete = () => resolve();
      txn.onerror = reject;
      txn.onabort = () => reject(new Error("Import aborted"));
    });

    const store = txn.objectStore(storeName);
    while (true) {
      const recordEnd = buf.indexOf(0x1e, i);
      if (recordEnd < 0) {
        marginal = decoder.decode(buf.subarray(i), { stream: true });
        break;
      }
      const text = marginal + decoder.decode(buf.subarray(i, recordEnd));
      i = recordEnd + 1;
      marginal = "";
      const [id, word] = text.split("\x1F");
      store.put(word, id);
      imported += 1;
    }
    txn.commit();
  }

  await db.put("meta", src, storeName);

  return imported;
}
