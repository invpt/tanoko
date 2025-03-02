import type { JMdict, Kanjidic2 } from "@scriptin/jmdict-simplified-types";
import * as path from "path";
import * as fs from "fs";

const input = path.join(import.meta.dir, "..", "data");
const output = path.join(import.meta.dir, "..", "src", "assets", "gen");
fs.mkdirSync(output, { recursive: true });

const jmdict: JMdict = await Bun.file(
  path.join(input, "jmdict-eng.json"),
).json();

const kanjidic: Kanjidic2 = await Bun.file(
  path.join(input, "kanjidic2-en.json"),
).json();

async function writeKanjidicKanji() {
  const file = Bun.file(path.join(output, "kanjidic-kanji.dsv")).writer();

  for (const character of kanjidic.characters) {
    file.write(character.literal);
    file.write("\x1F");
    file.write(JSON.stringify(character));
    file.write("\x1E");
  }

  await file.end();
}

async function writeKanjidicMeta() {
  const copied: Partial<Kanjidic2> = { ...kanjidic };
  delete copied["characters"];

  await Bun.file(path.join(output, "kanjidic-meta.json")).write(
    JSON.stringify(copied),
  );
}

async function writeJmdictKanji() {
  const file = Bun.file(path.join(output, "jmdict-words.dsv")).writer();

  for (const word of jmdict.words) {
    file.write(word.id);
    file.write("\x1F");
    file.write(JSON.stringify(word));
    file.write("\x1E");
  }

  await file.end();
}

async function writeJmdictMeta() {
  const copied: Partial<JMdict> = { ...jmdict };
  delete copied["words"];

  await Bun.file(path.join(output, "jmdict-meta.json")).write(
    JSON.stringify(copied),
  );
}

function buildIndex(): { id: string; text: string }[] {
  // parameters for the ordering of items in the index
  const c = 10;
  const l = 2;
  const p = 1;

  type IndexItem = {
    id: string;
    text: string;
    common: boolean;
    priority: number;
  };

  const index: IndexItem[] = [];

  const alreadyAdded = new Set<string>();

  const add = (item: IndexItem) => {
    if (!alreadyAdded.has(item.text)) {
      alreadyAdded.add(item.text);
      index.push(item);
    }
  };

  for (const word of jmdict.words) {
    for (const kanji of word.kanji) {
      add({
        id: word.id,
        text: kanji.text,
        common: kanji.common,
        priority: 0,
      });
    }

    for (const kana of word.kana) {
      add({
        id: word.id,
        text: kana.text,
        common: kana.common,
        priority: 0,
      });
    }

    for (let senseIdx = 0; senseIdx < word.sense.length; senseIdx++) {
      const sense = word.sense[senseIdx];

      const allKanji =
        sense.appliesToKanji.length === 1 && sense.appliesToKanji[0] === "*";
      const allKana =
        sense.appliesToKana.length === 1 && sense.appliesToKana[0] === "*";

      const commonKanji = word.kanji
        .filter((k) => allKanji || sense.appliesToKanji.includes(k.text))
        .some((k) => k.common);
      const commonKana = word.kana
        .filter((k) => allKana || sense.appliesToKana.includes(k.text))
        .some((k) => k.common);

      for (let glossIdx = 0; glossIdx < sense.gloss.length; glossIdx++) {
        const gloss = sense.gloss[glossIdx];
        const priority = senseIdx + glossIdx / sense.gloss.length;

        add({
          id: word.id,
          text: gloss.text,
          common: commonKanji || commonKana,
          priority,
        });
      }
    }

    alreadyAdded.clear();
  }

  const sortKey = (item: IndexItem) => {
    const uncommon = item.common ? 0 : 1;
    const length = item.text.length;
    const priority = item.priority;

    return c * uncommon + l * length + p * priority;
  };

  index.sort((a, b) => {
    const ord = sortKey(a) - sortKey(b);
    if (ord === 0) {
      return parseInt(a.id) - parseInt(b.id);
    } else {
      return ord;
    }
  });

  return index;
}

async function writeIndex(index: { id: string; text: string }[]) {
  const file = Bun.file(path.join(output, "jmdict-index.dsv")).writer();

  for (const item of index) {
    file.write(item.text);
    file.write("\x1F");
    file.write(item.id);
    file.write("\x1E");
  }

  await file.end();
}

await Promise.all([
  writeKanjidicKanji(),
  writeKanjidicMeta(),
  writeJmdictKanji(),
  writeJmdictMeta(),
  writeIndex(buildIndex()),
]);
