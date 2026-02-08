package util

// RuneToHiragana converts a katakana rune to hiragana, leaving other runes unchanged
func RuneToHiragana(r rune) rune {
	// Katakana range: U+30A1 to U+30F6
	// Hiragana range: U+3041 to U+3096
	// Offset between katakana and hiragana: 0x0060 (96)
	if r >= 0x30A1 && r <= 0x30F6 {
		return r - 0x0060
	}
	return r
}

// appendUniqueSorted appends a value to a sorted slice maintaining sort order and uniqueness
func AppendUniqueSorted(s []uint32, val uint32) []uint32 {
	if len(s) == 0 {
		return []uint32{val}
	}

	// Find insertion point using binary search
	i := 0
	j := len(s)
	for i < j {
		mid := (i + j) / 2
		if s[mid] < val {
			i = mid + 1
		} else {
			j = mid
		}
	}

	// If value already exists, return slice unchanged
	if i < len(s) && s[i] == val {
		return s
	}

	// Insert at position i
	s = append(s, 0)
	copy(s[i+1:], s[i:])
	s[i] = val
	return s
}
