package subset

import (
	"math"
	"sort"

	"github.com/invpt/tanoko/generator/src"
)

type CooccurrenceMatrix map[rune]CooccurenceVector

type CooccurenceVector map[rune]float64

func NewCooccurrenceMatrix() CooccurrenceMatrix {
	return make(CooccurrenceMatrix)
}

func (c CooccurrenceMatrix) FillFromJMdict(entries []src.JMdictWord, appliesTo RuneSet) {
	dedup := make(RuneSet)
	for _, entry := range entries {
		for _, kana := range entry.Kana {
			for _, r := range kana.Text {
				if _, exists := appliesTo[r]; exists {
					dedup[r] = struct{}{}
				}
			}
		}

		for _, kanji := range entry.Kanji {
			for _, r := range kanji.Text {
				if _, exists := appliesTo[r]; exists {
					dedup[r] = struct{}{}
				}
			}
		}

		for _, sense := range entry.Sense {
			for _, gloss := range sense.Gloss {
				for _, r := range gloss.Text {
					if _, exists := appliesTo[r]; exists {
						dedup[r] = struct{}{}
					}
				}
			}
		}

		c.add(dedup)
		clear(dedup)
	}
}

func (c CooccurrenceMatrix) FillFromCEDICT(entries []src.CEDICTEntry, simplified, traditional bool, appliesTo RuneSet) {
	dedup := make(RuneSet)
	for _, entry := range entries {
		if simplified {
			for _, r := range entry.Simplified {
				if _, exists := appliesTo[r]; exists {
					dedup[r] = struct{}{}
				}
			}
		}

		if traditional {
			for _, r := range entry.Traditional {
				if _, exists := appliesTo[r]; exists {
					dedup[r] = struct{}{}
				}
			}
		}

		for _, sense := range entry.Senses {
			for _, gloss := range sense {
				for _, r := range gloss {
					if _, exists := appliesTo[r]; exists {
						dedup[r] = struct{}{}
					}
				}
			}
		}

		c.add(dedup)
		clear(dedup)
	}
}

func (c CooccurrenceMatrix) add(runes RuneSet) {
	for r1 := range runes {
		if c[r1] == nil {
			c[r1] = make(CooccurenceVector)
		}

		for r2 := range runes {
			if r1 != r2 {
				c[r1][r2]++
			}
		}
	}
}

func (matrix CooccurrenceMatrix) runesOrdered() []rune {
	runes := make([]rune, 0, len(matrix))
	for r := range matrix {
		runes = append(runes, r)
	}

	// Sort for deterministic results
	sort.Slice(runes, func(i, j int) bool {
		return runes[i] < runes[j]
	})

	return runes
}

func (c CooccurrenceMatrix) normalize() {
	// Calculate document frequency (how many entries each rune appears in)
	runeFreq := make(CooccurenceVector)
	totalEntries := 0.0

	for r1 := range c {
		totalEntries++
		for r2 := range c[r1] {
			runeFreq[r2]++
		}
	}

	for r1, cooccurrences := range c {
		// Calculate total co-occurrences for this rune (for TF normalization)
		total := 0.0
		for _, count := range cooccurrences {
			total += count
		}

		for r2, count := range cooccurrences {
			// TF: normalized frequency
			tf := count / total

			// IDF: inverse document frequency
			idf := math.Log(totalEntries / runeFreq[r2])

			c[r1][r2] = tf * idf
		}
	}
}

func (v1 CooccurenceVector) cosineSimilarity(v2 CooccurenceVector) float64 {
	var dotProduct, norm1, norm2 float64

	// Calculate dot product and norms
	for r, val1 := range v1 {
		if val2, exists := v2[r]; exists {
			dotProduct += val1 * val2
		}
		norm1 += val1 * val1
	}

	for _, val2 := range v2 {
		norm2 += val2 * val2
	}

	if norm1 == 0 || norm2 == 0 {
		return 0
	}

	return dotProduct / (math.Sqrt(norm1) * math.Sqrt(norm2))
}

func (v1 CooccurenceVector) euclideanDistance(v2 CooccurenceVector) float64 {
	// Get all dimensions that appear in either vector
	allDims := make(RuneSet)
	for r := range v1 {
		allDims[r] = struct{}{}
	}
	for r := range v2 {
		allDims[r] = struct{}{}
	}

	var sumSquares float64
	for r := range allDims {
		val1 := v1[r] // will be 0 if not present
		val2 := v2[r] // will be 0 if not present
		diff := val1 - val2
		sumSquares += diff * diff
	}

	return math.Sqrt(sumSquares)
}
