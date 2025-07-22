package main

import (
	"fmt"
	"regexp"
	"unicode"
)

var (
	// Regular expression to split on word boundaries and punctuation
	wordSplitRegex = regexp.MustCompile(`[^\p{L}\p{N}]+`)

	// Common English words to potentially filter out (very basic list)
	commonStopWords = map[string]bool{
		"a": true, "an": true, "and": true, "are": true, "as": true, "at": true, "be": true, "by": true,
		"for": true, "from": true, "has": true, "he": true, "in": true, "is": true, "it": true, "its": true,
		"of": true, "on": true, "that": true, "the": true, "to": true, "was": true, "will": true, "with": true,
	}
)

// stripSquareBrackets removes text enclosed in square brackets from the input string
func stripSquareBrackets(text string) string {
	result := ""
	depth := 0

	for _, char := range text {
		if char == '[' {
			depth++
		} else if char == ']' {
			if depth > 0 {
				depth--
			}
		} else if depth == 0 {
			result += string(char)
		}
	}

	return result
}

// isLatinText checks if the text contains only Latin script characters and basic punctuation
func isLatinText(text string) bool {
	for _, r := range text {
		if unicode.IsLetter(r) {
			// Check if the letter is from Latin script (Basic Latin + Latin-1 Supplement + Latin Extended)
			if !((r >= 0x0041 && r <= 0x005A) || // A-Z
				(r >= 0x0061 && r <= 0x007A) || // a-z
				(r >= 0x00C0 && r <= 0x024F)) { // Latin-1 Supplement + Latin Extended-A + Latin Extended-B
				return false
			}
		}
		// Allow digits, spaces, and common punctuation
	}
	return true
}

// EnglishToken represents a normalized English word with metadata
type EnglishToken struct {
	Word     string
	Original string
	Length   int
}

// EnglishStats contains statistics about English words in a dictionary
type EnglishStats struct {
	TotalEntries        int
	TotalGlosses        int
	UniqueWords         int
	UniqueWordsNoStop   int
	WordFrequencies     map[string]int
	LengthDistribution  map[int]int
	PostingListSizes    map[int]int // frequency -> count of words with that frequency
	TopWords            []WordFrequency
	LongestWords        []string
	ShortestWords       []string
	LargestPostingLists []WordFrequency
	ContextExamples     map[string][]string // word -> sample contexts
}

// WordFrequency represents a word and its frequency count
type WordFrequency struct {
	Word  string
	Count int
}

// analyzeCommonWords identifies which words should be treated as "common words" for bitflag storage
func analyzeCommonWords(stats EnglishStats) {
	// Use unified common words list from CEDICT analysis (superset)
	unifiedCommonWords := []string{
		"to", "of", "the", "in", "and", "idiom", "or", "one",
		"for", "variant", "county", "etc", "on", "be", "with", "an",
	}

	// Analyze how these words perform in this dictionary
	var candidates []WordFrequency
	totalSavings := 0

	fmt.Printf("  Unified common words analysis:\n")
	for _, word := range unifiedCommonWords {
		frequency := stats.WordFrequencies[word]
		if frequency > 0 {
			// Calculate space savings: original size - capped size
			originalSize := frequency * 4 // 4 bytes per uint32
			cappedSize := 1000 * 4        // Cap at 1000 entries
			if frequency < 1000 {
				cappedSize = frequency * 4
			}

			savings := originalSize - cappedSize
			totalSavings += savings

			candidates = append(candidates, WordFrequency{Word: word, Count: frequency})

			fmt.Printf("    %-15s: %6d entries -> %4d entries (saves %6.1f KB)\n",
				word, frequency, min(frequency, 1000), float64(savings)/1024.0)
		} else {
			fmt.Printf("    %-15s: %6d entries (not found in this dictionary)\n", word, 0)
		}
	}

	// Calculate bitflag overhead
	bitflagOverhead := stats.TotalEntries * 2 // 2 bytes (uint16) per entry
	totalSavingsKB := float64(totalSavings-bitflagOverhead) / 1024.0

	fmt.Printf("\n  Unified bitflag approach summary:\n")
	fmt.Printf("    Total common words: %d\n", len(unifiedCommonWords))
	fmt.Printf("    Words found in this dictionary: %d\n", len(candidates))
	fmt.Printf("    Bitflag overhead: %.1f KB (%d entries × 2 bytes)\n",
		float64(bitflagOverhead)/1024.0, stats.TotalEntries)
	fmt.Printf("    Total space savings: %.1f KB\n", totalSavingsKB)

	if totalSavingsKB > 0 {
		fmt.Printf("    ✅ Unified bitflag approach is beneficial!\n")
	} else {
		fmt.Printf("    ❌ Unified bitflag approach may not be worth it for this dataset\n")
	}
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
