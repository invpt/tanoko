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
