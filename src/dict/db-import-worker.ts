import { DictDbSchema, openDictDb } from "./db";
import jmdictWordsUrl from "../assets/gen/jmdict-words.dsv?url";
import kanjidicKanjiUrl from "../assets/gen/kanjidic-kanji.dsv?url";
import cedictWordsUrl from "../assets/gen/cedict-words.dsv?url";
import { IDBPDatabase } from "idb";

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
  let kanjidicBytes = 0;
  let cedictBytes = 0;

  const reportProgress = () =>
    progressCallback?.(jmdictBytes + kanjidicBytes + cedictBytes);

  await Promise.all([
    importDsv(db, "jmdict", jmdictWordsUrl, (bytes) => {
      jmdictBytes = bytes;
      reportProgress();
    }),
    importDsv(db, "kanjidic", kanjidicKanjiUrl, (bytes) => {
      kanjidicBytes = bytes;
      reportProgress();
    }),
    importDsv(db, "cedict", cedictWordsUrl, (bytes) => {
      cedictBytes = bytes;
      reportProgress();
    }),
  ]);
}

async function importDsv(
  db: IDBPDatabase<DictDbSchema>,
  storeName: "jmdict" | "kanjidic" | "cedict",
  src: string,
  progressCallback: (downloaded: number) => void,
): Promise<void> {
  if ((await db.get("meta", storeName)) === src) {
    return;
  }

  let totalBytes = 0;
  const batchSize = 1000;
  let batch: { id: string; value: string }[] = [];

  const processBatch = async (records: { id: string; value: string }[]) => {
    if (records.length === 0) return;

    const txn = db.transaction(storeName, "readwrite");
    const store = txn.objectStore(storeName);

    for (const record of records) {
      store.put(record.value, record.id);
    }

    return new Promise<void>((resolve, reject) => {
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
      txn.onabort = () => reject(new Error("Transaction aborted"));
    });
  };

  for await (const record of parseDsvStream(src, {
    progressCallback: (bytes) => progressCallback((totalBytes = bytes)),
    progressInterval: 10240,
  })) {
    batch.push(record);

    if (batch.length >= batchSize) {
      await processBatch(batch);
      batch = [];
    }
  }

  await processBatch(batch);

  await db.put("meta", src, storeName);
}

interface DsvRecord {
  id: string;
  value: string;
}

interface DsvParseOptions {
  progressCallback?: (bytesLoaded: number) => void;
  progressInterval?: number;
}

async function* parseDsvStream(
  src: string,
  options: DsvParseOptions = {},
): AsyncGenerator<DsvRecord, void, void> {
  const { progressCallback, progressInterval = 10000 } = options;

  progressCallback?.(0);

  const resp = await fetch(src);
  const reader = resp.body?.getReader();
  if (reader == null) {
    throw new Error("Response must have a body");
  }

  const decoder = new TextDecoder("utf-8");

  let bytesDownloaded = 0;
  let lastStatusUpdate = 0;
  let marginal = "";

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      const buf = result.value;
      bytesDownloaded += buf.length;

      if (bytesDownloaded - lastStatusUpdate >= progressInterval) {
        progressCallback?.((lastStatusUpdate = bytesDownloaded));
      }

      let i = 0;
      while (true) {
        const recordEnd = buf.indexOf(0x1e, i);
        if (recordEnd < 0) {
          marginal = decoder.decode(buf.subarray(i), { stream: true });
          break;
        }

        const text = marginal + decoder.decode(buf.subarray(i, recordEnd));
        i = recordEnd + 1;
        marginal = "";

        const sep = text.indexOf("\x1F");
        yield { id: text.substring(0, sep), value: text.substring(sep + 1) };
      }
    }
  } finally {
    reader.releaseLock();
  }

  progressCallback?.(bytesDownloaded);
}
