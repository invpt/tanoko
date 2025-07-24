package util

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
