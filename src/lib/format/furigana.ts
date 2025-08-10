export type FuriganaSegment = {
  kanji: string;
  kana: string;
};

export function segmentFurigana(kanji: string, kana: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  let kanjiChars = [...kanji];
  let kanaChars = [...kana];

  while (kanjiChars.length > 0 || kanaChars.length > 0) {
    let kanjiMatch = -1;
    let kanaMatch = -1;

    for (let k = 0; k < kanjiChars.length; k++) {
      // Wacky bound is so that if we're at the very start of the (remaining) kanji, we can only
      // accept an exact match with the kana if we're looking at the first kana.
      for (let r = 0; r < (k === 0 ? Math.min(1, kanaChars.length) : kanaChars.length); r++) {
        if (kanjiChars[k] === kanaChars[r]) {
          kanjiMatch = k;
          kanaMatch = r;
          break;
        }
      }
      if (kanjiMatch !== -1) break;
    }

    if (kanjiMatch === -1) {
      segments.push({
        kanji: kanjiChars.join(""),
        kana: kanaChars.join(""),
      });
      break;
    }

    // Handle unmatched portion before the match
    if (kanjiMatch > 0) {
      segments.push({
        kanji: kanjiChars.slice(0, kanjiMatch).join(""),
        kana: kanaChars.slice(0, kanaMatch).join(""),
      });
    }

    // Extend the match as far as possible
    let matchLength = 0;
    while (
      kanjiMatch + matchLength < kanjiChars.length &&
      kanaMatch + matchLength < kanaChars.length &&
      kanjiChars[kanjiMatch + matchLength] === kanaChars[kanaMatch + matchLength]
    ) {
      matchLength++;
    }

    const matchedKanji = kanjiChars.slice(kanjiMatch, kanjiMatch + matchLength).join("");
    segments.push({
      kanji: matchedKanji,
      kana: "",
    });

    kanjiChars = kanjiChars.slice(kanjiMatch + matchLength);
    kanaChars = kanaChars.slice(kanaMatch + matchLength);
  }

  return segments;
}
