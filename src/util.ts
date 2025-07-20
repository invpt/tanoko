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
