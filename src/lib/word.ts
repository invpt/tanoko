export function segmentFurigana(
  kanji: string,
  reading: string,
): { kanji: string; reading: string }[] {
  const segments: { kanji: string; reading: string }[] = [];

  let current = { kanji: "", reading: "" };

  for (const char of kanji) {
    const r = reading.lastIndexOf(char);
    if (r >= 0) {
      current.reading = reading.substring(0, r);
      segments.push(current);
      segments.push({ kanji: char, reading: "" });
      reading = reading.substring(r + char.length);
      current = { kanji: "", reading: "" };
    } else {
      current.kanji += char;
    }
  }

  current.reading = reading;

  if (current.kanji.length > 0 || current.reading.length > 0) {
    segments.push(current);
  }

  return segments;
}

export function segmentPinyin(hanzi: string, pinyin: string): { hanzi: string; pinyin: string }[] {
  const hanziArr = [...hanzi];
  const pinyinArr = pinyin.split(" ");
  if (hanziArr.length === pinyinArr.length) {
    return hanziArr.map((char, index) => ({ hanzi: char, pinyin: pinyinArr[index] }));
  } else {
    return [{ hanzi, pinyin }];
  }
}

export function toneNumbersToAccents(pinyin: string): string {
  const toneMap: { [key: string]: string[] } = {
    a: ["a", "ā", "á", "ă", "à"],
    e: ["e", "ē", "é", "ě", "è"],
    i: ["i", "ī", "í", "ǐ", "ì"],
    o: ["o", "ō", "ó", "ǒ", "ò"],
    u: ["u", "ū", "ú", "ǔ", "ù"],
    ü: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
  };

  return pinyin
    .split(/\s+/) // Split by one or more spaces
    .map((syllable) => {
      syllable = syllable.replace(/u:/g, "ü");

      // Extract the tone number
      const toneMatch = syllable.match(/([1-5])$/);
      let tone = 5; // Default to tone 5 (no accent)
      let syllableWithoutToneNum = syllable;

      if (toneMatch) {
        tone = parseInt(toneMatch[1], 10);
        syllableWithoutToneNum = syllable.slice(0, -1);
      }

      if (tone === 5) {
        return syllableWithoutToneNum;
      }

      let accentVowelChar: string | undefined;
      let accentIndex = -1;

      // Pinyin tone placement rules:
      // 1. Accent on 'a' or 'e'.
      // 2. Accent on 'o' if no 'a' or 'e'.
      // 3. For 'iu' combination, accent on 'u'.
      // 4. For 'ui' combination, accent on 'i'.
      // 5. Otherwise, accent on the last vowel in the syllable (among i, u, ü).

      // Rule 1: 'a'
      if (syllableWithoutToneNum.includes("a")) {
        accentVowelChar = "a";
        accentIndex = syllableWithoutToneNum.indexOf("a");
      }
      // Rule 1: 'e' (if no 'a')
      else if (syllableWithoutToneNum.includes("e")) {
        accentVowelChar = "e";
        accentIndex = syllableWithoutToneNum.indexOf("e");
      }
      // Rule 2: 'o' (if no 'a' or 'e')
      else if (syllableWithoutToneNum.includes("o")) {
        accentVowelChar = "o";
        accentIndex = syllableWithoutToneNum.indexOf("o");
      }
      // Rule 3: 'iu' special case
      else if (syllableWithoutToneNum.includes("iu")) {
        accentVowelChar = "u";
        accentIndex = syllableWithoutToneNum.indexOf("iu") + 1; // 'u' is the second character in 'iu'
      }
      // Rule 4: 'ui' special case
      else if (syllableWithoutToneNum.includes("ui")) {
        accentVowelChar = "i";
        accentIndex = syllableWithoutToneNum.indexOf("ui") + 1; // 'i' is the second character in 'ui'
      }
      // Rule 5: Last vowel (for remaining 'i', 'u', 'ü' syllables)
      else {
        // Iterate backwards to find the rightmost vowel among 'i', 'u', 'ü'
        for (let i = syllableWithoutToneNum.length - 1; i >= 0; i--) {
          const char = syllableWithoutToneNum[i];
          if (["i", "u", "ü"].includes(char)) {
            accentVowelChar = char;
            accentIndex = i;
            break;
          }
        }
      }

      if (accentVowelChar && accentIndex !== -1) {
        const accentedVowel = toneMap[accentVowelChar][tone];
        return (
          syllableWithoutToneNum.substring(0, accentIndex) +
          accentedVowel +
          syllableWithoutToneNum.substring(accentIndex + 1)
        );
      } else {
        // No vowel found or unable to determine accent position, return original (without tone number)
        return syllableWithoutToneNum;
      }
    })
    .join(" ");
}
