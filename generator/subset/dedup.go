package subset

import (
	"fmt"
	"log"
	"os"
	"strings"

	"golang.org/x/image/font/sfnt"
	"golang.org/x/image/math/fixed"
)

const ttcPath = "NotoSerifCJK-Regular.ttc"

type DedupSubset struct {
	FontIndex int
	RuneSet   RuneSet
}

func CreateDedupSubsets(scriptSets map[Scripts]RuneSet) (map[Scripts]*DedupSubset, error) {
	sets := make([]RuneSet, len(ScriptsOrdered))
	for i, s := range ScriptsOrdered {
		sets[i] = scriptSets[s]
	}

	data, err := os.ReadFile(ttcPath)
	if err != nil {
		return nil, fmt.Errorf("Error reading TTC file: %v", err)
	}

	collection, err := sfnt.ParseCollection(data)
	if err != nil {
		log.Fatalf("Error parsing TTC file: %v", err)
	}

	numFonts := collection.NumFonts()

	var b sfnt.Buffer
	fonts := make([]*sfnt.Font, len(ScriptsOrdered))
	fontIndices := make(map[Scripts]int, len(ScriptsOrdered))
	for i := 0; i < numFonts; i++ {
		font, err := collection.Font(i)
		if err != nil {
			return nil, fmt.Errorf("Error loading font %d: %v", i, err)
		}
		name, err := font.Name(&b, sfnt.NameIDFamily)
		if err != nil {
			return nil, fmt.Errorf("Error loading font %d name: %v", i, err)
		}

		for j, s := range ScriptsOrdered {
			if strings.Contains(name, s.Names()) {
				fonts[j] = font
				fontIndices[s] = i
			}
		}
	}

	for _, f := range fonts {
		if f == nil {
			return nil, fmt.Errorf("Couldn't load all necessary fonts")
		}
	}

	comparison := compareOutlines(fonts)

	subsets := make(map[Scripts]*DedupSubset)

	groupings := make(map[int]Scripts)
	for r, groups := range comparison {
		for i, group := range groups {
			if _, ok := sets[i][r]; !ok {
				// don't include runes we don't need
				continue
			}
			groupings[group] |= ScriptsOrdered[i]
		}

		for _, group := range groupings {
			if _, ok := subsets[group]; !ok {
				subsets[group] = &DedupSubset{}
				subsets[group].FontIndex = fontIndices[group.First()]
				subsets[group].RuneSet = make(RuneSet)
			}

			subsets[group].RuneSet[r] = struct{}{}
		}

		clear(groupings)
	}

	return subsets, nil
}

func glyphsEq(a sfnt.Segments, b sfnt.Segments) bool {
	if len(a) != len(b) {
		return false
	}

	for i := 0; i < len(a); i++ {
		if a[i].Op != b[i].Op {
			return false
		}

		for j := 0; j < 3; j++ {
			if a[i].Args[j] != b[i].Args[j] {
				return false
			}
		}
	}

	return true
}

func compareOutlines(fonts []*sfnt.Font) map[rune][]int {
	result := make(map[rune][]int)

	var b sfnt.Buffer
	glyphs := make([]sfnt.Segments, len(fonts))
	for codepoint := rune(0x0000); codepoint <= 0x10FFFF; codepoint++ {
		glyphs = glyphs[:0]
		valid := true
		mapping := make([]int, len(fonts))
		for i, font := range fonts {
			glyphIndex, err := font.GlyphIndex(&b, codepoint)
			if err != nil || glyphIndex == 0 {
				valid = false
				break
			}
			glyph, err := font.LoadGlyph(&b, glyphIndex, fixed.I(1000), nil)
			if err != nil {
				valid = false
				break
			}

			index := -1
			for j, other := range glyphs {
				if glyphsEq(glyph, other) {
					index = j
					break
				}
			}

			if index == -1 {
				glyphs = append(glyphs, glyph)
				mapping[i] = len(glyphs) - 1
			} else {
				mapping[i] = index
			}
		}

		if !valid {
			continue
		}

		result[codepoint] = mapping
	}

	return result
}
