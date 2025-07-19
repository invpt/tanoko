function pluralize(value: number, unit: string) {
  return `${value} ${unit}${value !== 1 ? "s" : ""}`;
}

function joinWithAnd(first: string, second: string) {
  return `${first} and ${second}`;
}

export function smartApproximateDuration(ms: number) {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const years = Math.floor(ms / year);
  ms %= year;
  const months = Math.floor(ms / month);
  ms %= month;
  const weeks = Math.floor(ms / week);
  ms %= week;
  const days = Math.floor(ms / day);
  ms %= day;
  const hours = Math.floor(ms / hour);
  ms %= hour;
  const minutes = Math.floor(ms / minute);

  const yearStr = pluralize(years, "year");
  const monthStr = pluralize(months, "month");
  const weekStr = pluralize(weeks, "week");
  const dayStr = pluralize(days, "day");
  const hourStr = pluralize(hours, "hour");
  const minuteStr = pluralize(minutes, "minute");

  if (years > 0) {
    if (months > 0) {
      return joinWithAnd(yearStr, monthStr);
    }
    return yearStr;
  }

  if (months > 0) {
    if (weeks > 0) {
      return joinWithAnd(monthStr, weekStr);
    }
    return monthStr;
  }

  if (weeks > 0) {
    if (days > 0) {
      return joinWithAnd(weekStr, dayStr);
    }
    return weekStr;
  }

  if (days > 0) {
    if (hours > 0) {
      return joinWithAnd(dayStr, hourStr);
    }
    return dayStr;
  }

  if (hours > 0) {
    if (minutes > 0) {
      return joinWithAnd(hourStr, minuteStr);
    }
    return hourStr;
  }

  if (minutes > 0) {
    return pluralize(minutes, "minute");
  }

  return "less than a minute";
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

export function segmentReading(
  kanji: string,
  reading: string,
): { kanji: string; reading: string }[] {
  const segments: { kanji: string; reading: string }[] = [];

  // Helper to check if a character is Hiragana or Katakana
  const isKana = (char: string) => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    // Hiragana: U+3040 – U+309F
    // Katakana: U+30A0 – U+30FF
    return (
      (code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)
    );
  };

  let currentKanji = kanji;
  let currentReading = reading;

  // 1. Handle initial common prefix (e.g., in cases like "本日" and "ほんじつ", where '本' and 'ほ' match)
  // This handles direct character matches between kanji and reading that appear at the beginning.
  let commonPrefixK = "";
  let commonPrefixR = "";
  while (
    currentKanji.length > 0 &&
    currentReading.length > 0 &&
    currentKanji[0] === currentReading[0]
  ) {
    commonPrefixK += currentKanji[0];
    commonPrefixR += currentReading[0];
    currentKanji = currentKanji.substring(1);
    currentReading = currentReading.substring(1);
  }
  if (commonPrefixK.length > 0) {
    segments.push({
      kanji: commonPrefixK,
      reading:
        commonPrefixK === commonPrefixR && isKana(commonPrefixK[0])
          ? ""
          : commonPrefixR,
    });
  }

  // 2. Iteratively segment the middle parts, handling kanji chunks and intermediate okurigana
  while (currentKanji.length > 0) {
    let kanjiChunk = "";
    let kanaInKanji = ""; // This will store the actual okurigana found within the kanji string

    // Accumulate kanji characters until a kana character is found in `currentKanji` or end of string
    let i = 0;
    while (i < currentKanji.length && !isKana(currentKanji[i])) {
      kanjiChunk += currentKanji[i];
      i++;
    }

    // Move currentKanji past the accumulated kanjiChunk
    currentKanji = currentKanji.substring(i);

    // If we accumulated a kanjiChunk
    if (kanjiChunk.length > 0) {
      // If there are no more characters in `currentKanji` after the `kanjiChunk`,
      // it means this `kanjiChunk` is the last part and takes the rest of `currentReading`.
      if (currentKanji.length === 0) {
        segments.push({ kanji: kanjiChunk, reading: currentReading });
        currentReading = ""; // All reading consumed
        break; // Done with segmentation
      }

      // If `currentKanji` still has characters, the next part should be kana (okurigana)
      let j = 0;
      while (j < currentKanji.length && isKana(currentKanji[j])) {
        kanaInKanji += currentKanji[j];
        j++;
      }
      // Move currentKanji past the identified kana sequence (okurigana)
      currentKanji = currentKanji.substring(j);

      // Try to find this `kanaInKanji` sequence in the `currentReading`.
      // This `kanaInKanji` acts as a delimiter to split `currentReading`.
      const splitIndex = currentReading.indexOf(kanaInKanji);

      if (splitIndex !== -1) {
        // If found, push the kanjiChunk with its corresponding reading part
        segments.push({
          kanji: kanjiChunk,
          reading: currentReading.substring(0, splitIndex),
        });
        // Then push the okurigana itself (kanji and reading are the same for okurigana)
        segments.push({ kanji: kanaInKanji, reading: "" });
        // Update currentReading to the part after the okurigana
        currentReading = currentReading.substring(
          splitIndex + kanaInKanji.length,
        );
      } else {
        // This 'else' block handles cases where the kana in the kanji string
        // does not act as a distinct segment delimiter in the reading.
        // For example, in "食べる" (たべる), 'べ' and 'る' are kana in the kanji string,
        // but they form part of the reading for the '食' kanji, not separate segments.
        // In such cases, we combine the `kanjiChunk` and the `kanaInKanji` and assign
        // the entire remaining `currentReading` to it.
        segments.push({
          kanji: kanjiChunk + kanaInKanji,
          reading: currentReading,
        });
        currentReading = "";
        break;
      }
    } else {
      // This case is hit if `currentKanji` starts directly with kana (e.g., if the word was "り仮名").
      // In this scenario, it's safest to assume the entire remaining kanji string
      // (which is all kana here) maps to the entire remaining reading string.
      segments.push({
        kanji: currentKanji,
        reading:
          currentKanji === currentReading && isKana(currentKanji[0])
            ? ""
            : currentReading,
      });
      currentKanji = "";
      currentReading = "";
      break;
    }
  }

  // If, for any reason, parts of kanji or reading remain unsegmented,
  // add them as a final segment. This should ideally not be reached
  // if the above logic covers all scenarios.
  if (currentKanji.length > 0 || currentReading.length > 0) {
    segments.push({
      kanji: currentKanji,
      reading:
        currentKanji === currentReading && isKana(currentKanji[0])
          ? ""
          : currentReading,
    });
  }

  return segments;
}
