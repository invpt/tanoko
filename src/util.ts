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

export function segmentReading(kanji: string, reading: string): { kanji: string, reading: string }[] {
    const segment = { kanji, reading };
    const segments: { kanji: string, reading: string }[] = [];

    let prefix = { kanji: "", reading: "" };
    while (segment.kanji[0] == segment.reading[0]) {
        prefix.kanji += segment.kanji[0];
        segment.kanji = segment.kanji.substring(1);
        segment.reading = segment.reading.substring(1);
    }
    if (prefix.kanji !== "") {
        segments.push(prefix);
    }
    segments.push(segment);
    let suffix = { kanji: "", reading: "" };
    while (segment.kanji[segment.kanji.length - 1] == segment.reading[segment.reading.length - 1]) {
        suffix.kanji = segment.kanji[segment.kanji.length - 1] + suffix.kanji;
        segment.kanji = segment.kanji.substring(0, segment.kanji.length - 1);
        segment.reading = segment.reading.substring(0, segment.reading.length - 1);
    }
    if (suffix.kanji !== "") {
        segments.push(suffix);
    }

    return segments;
}
