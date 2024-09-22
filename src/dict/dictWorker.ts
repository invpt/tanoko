import { JMdictWord } from "@scriptin/jmdict-simplified-types";
import { openDB } from "idb";
import { DictMessage, DictMessageResponse } from "./dict";

const loadingStatus = (words: number) => {
  self.postMessage({ type: "status", status: "loading", words });
};

const readyStatus = (words: number) => {
  self.postMessage({ type: "status", status: "ready", words });
};

const failureStatus = (error: unknown) => {
  console.error("FAILURE", error);
  self.postMessage({ type: "status", status: "failure", error });
};

const indexPromise = (async () => {
  const resp = await fetch("/src/assets/gen/jmdict-index.txt");
  return await resp.text();
})();

indexPromise.catch((error) => failureStatus(error));

const dictPromise = (async () => {
  const db = await openDB<{
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
  }>("tanoko", 1, {
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

  const jmdictSrc = "/src/assets/gen/jmdict-words.txt";

  if ((await db.get("meta", "jmdictSrc")) !== jmdictSrc) {
    loadingStatus(0);

    const resp = await fetch(jmdictSrc);
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder("utf-8");

    let imported = 0;
    let lastStatusUpdate = 0;
    const statusUpdate = () => {
      if (imported - lastStatusUpdate >= 10000) {
        loadingStatus(imported);
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
      statusUpdate();
      if (result.done) {
        break;
      }
      const buf = result.value;

      let i = 0;
      const txn = db.transaction("jmdict", "readwrite");
      completion = new Promise((resolve, reject) => {
        txn.oncomplete = () => resolve();
        txn.onerror = reject;
        txn.onabort = reject;
      });
      const store = txn.objectStore("jmdict")!;
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

    await db.put("meta", jmdictSrc, "jmdictSrc");
  }

  const kanjidicSrc = "/src/assets/gen/kanjidic-kanji.txt";

  const jmdc = await db.count("jmdict");
  if ((await db.get("meta", "kanjidicSrc")) !== kanjidicSrc) {
    const resp = await fetch(kanjidicSrc);
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder("utf-8");

    let imported = 0;
    let lastStatusUpdate = 0;
    const statusUpdate = () => {
      if (imported - lastStatusUpdate >= 10000) {
        loadingStatus(imported);
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
      statusUpdate();
      if (result.done) {
        break;
      }
      const buf = result.value;

      let i = 0;
      const txn = db.transaction("kanjidic", "readwrite");
      completion = new Promise((resolve, reject) => {
        txn.oncomplete = () => resolve();
        txn.onerror = reject;
        txn.onabort = reject;
      });
      const store = txn.objectStore("kanjidic")!;
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

    await db.put("meta", kanjidicSrc, "kanjidicSrc");
  }

  readyStatus((await db.count("jmdict")) + (await db.count("kanjidic")));

  return db;
})();

dictPromise.catch((error) => failureStatus(error));

const respond = <M extends DictMessage>(response: DictMessageResponse<M>) => {
  self.postMessage({ type: "response", data: response });
};

let prev = Promise.resolve();
self.onmessage = (event: MessageEvent<DictMessage>) =>
  (prev = (async () => {
    await prev;
    const index = await indexPromise;
    const dict = await dictPromise;

    switch (event.data.command) {
      case "search":
        const query = event.data.query;

        const results: JMdictWord[] = [];
        let start = 0;
        while (results.length < 10) {
          const i = index.indexOf(query, start);
          if (i < 0) {
            break;
          } else {
            const unit = index.indexOf("\x1F", i);
            const record = index.indexOf("\x1E", i);
            if (unit < 0 || record < 0) {
              break;
            }

            if (record < unit) {
              // the search matched an ID, not text!
              start = record + 1;
              continue;
            }

            const word = await dict.get(
              "jmdict",
              index.substring(unit + 1, record),
            );

            const parsed: JMdictWord | undefined = word && JSON.parse(word);
            if (
              parsed !== undefined &&
              !results.some((x) => x.id === parsed.id)
            ) {
              results.push(parsed);
            }
            start = record + 1;
          }
        }

        respond(results);
        break;
      case "get":
        const id = event.data.id;
        const word = await dict.get("jmdict", id);

        respond(word && JSON.parse(word));
        break;
      case "getKanji":
        const literal = event.data.literal;
        const kanji = await dict.get("kanjidic", literal);

        respond(kanji && JSON.parse(kanji));
        break;
      default:
        throw new Error("Unrecognized command");
    }
  })());
