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

  const isKana = (char: string) => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (
      (code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)
    );
  };

  let currentKanji = kanji;
  let currentReading = reading;

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

  while (currentKanji.length > 0) {
    let kanjiChunk = "";
    let kanaInKanji = "";
    let i = 0;
    while (i < currentKanji.length && !isKana(currentKanji[i])) {
      kanjiChunk += currentKanji[i];
      i++;
    }

    currentKanji = currentKanji.substring(i);

    if (kanjiChunk.length > 0) {
      if (currentKanji.length === 0) {
        segments.push({ kanji: kanjiChunk, reading: currentReading });
        currentReading = "";
        break;
      }

      let j = 0;
      while (j < currentKanji.length && isKana(currentKanji[j])) {
        kanaInKanji += currentKanji[j];
        j++;
      }
      currentKanji = currentKanji.substring(j);

      const splitIndex = currentReading.indexOf(kanaInKanji);

      if (splitIndex !== -1) {
        segments.push({
          kanji: kanjiChunk,
          reading: currentReading.substring(0, splitIndex),
        });
        segments.push({ kanji: kanaInKanji, reading: "" });
        currentReading = currentReading.substring(
          splitIndex + kanaInKanji.length,
        );
      } else {
        segments.push({
          kanji: kanjiChunk + kanaInKanji,
          reading: currentReading,
        });
        currentReading = "";
        break;
      }
    } else {
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
