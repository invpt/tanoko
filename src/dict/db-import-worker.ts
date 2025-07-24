import { DictDbSchema, openDictDb } from "./db";
import { IDBPDatabase } from "idb";
import { Decoder, StreamDecoder } from "./decode";

import jmdictUrl from "../assets/gen/jmdict.bin?url";
import cedictUrl from "../assets/gen/cedict.bin?url";

(async () => {
  try {
    await runImport((kb) => {
      self.postMessage({ status: "loading", bytes: kb });
    });
    self.postMessage({ status: "success" });
  } catch (error) {
    self.postMessage({ status: "failure", error });
  }
})();

async function runImport(progressCallback?: (bytesDownloaded: number) => void) {
  const db = await openDictDb();

  let jmdictBytes = 0;
  let cedictBytes = 0;

  const reportProgress = () => progressCallback?.(jmdictBytes + cedictBytes);

  await Promise.all([
    importDict(
      db,
      "jmdict",
      jmdictUrl,
      (d) => d.string(),
      (bytes) => {
        jmdictBytes = bytes;
        reportProgress();
      },
    ),
    importDict(
      db,
      "cedict",
      cedictUrl,
      (d) => {
        const traditional = d.string();
        const simplified = d.string();
        return traditional === simplified
          ? traditional
          : `${traditional}|${simplified}`;
      },
      (bytes) => {
        cedictBytes = bytes;
        reportProgress();
      },
    ),
  ]);
}

async function importDict(
  db: IDBPDatabase<DictDbSchema>,
  storeName: "jmdict" | "cedict",
  src: string,
  decodeRef: (d: Decoder) => string,
  progressCallback: (downloaded: number) => void,
): Promise<void> {
  if ((await db.get("meta", storeName)) === src) {
    return;
  }

  const resp = await fetch(src);
  if (resp.body == null) {
    throw new Error("Response must have a body");
  }

  let bytesDownloaded = 0;

  const processBatch = async (
    records: { id: number; ref: string; data: Uint8Array }[],
  ) => {
    if (records.length === 0) return;

    progressCallback(bytesDownloaded);

    const txn = db.transaction(storeName, "readwrite");
    const store = txn.objectStore(storeName);

    for (const record of records) {
      store.put({ ref: record.ref, data: record.data }, record.id);
    }

    return new Promise<void>((resolve, reject) => {
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
      txn.onabort = () => reject(new Error("Transaction aborted"));
    });
  };

  const batchSize = 1000;
  let batch: { id: number; ref: string; data: Uint8Array }[] = [];

  const stream = new StreamDecoder(resp.body);
  for await (const bytes of stream) {
    bytesDownloaded += bytes.length;

    const d = new Decoder(bytes);
    batch.push({
      id: d.uvarint(),
      data: d.rest(),
      ref: decodeRef(d),
    });

    if (batch.length >= batchSize) {
      await processBatch(batch);
      batch = [];
    }
  }

  await processBatch(batch);

  await db.put("meta", src, storeName);
}
