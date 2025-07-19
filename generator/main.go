package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/invpt/tanoko/generator/cedict"
	"github.com/invpt/tanoko/generator/jmdict"
)

const (
	unitSeparator   = "\x1F"
	recordSeparator = "\x1E"
)

func main() {
	// Define command-line flags
	var (
		clearCacheFlag = flag.Bool("clear-cache", false, "Clear the download cache before running")
		helpFlag       = flag.Bool("help", false, "Show help message")
	)
	flag.Parse()

	if *helpFlag {
		fmt.Println("Tanoko Dictionary Generator")
		fmt.Println("Usage:")
		flag.PrintDefaults()
		return
	}

	if *clearCacheFlag {
		if err := clearCache(); err != nil {
			fmt.Printf("Error clearing cache: %v\n", err)
			os.Exit(1)
		}
	}

	// Create output directory
	outputDir := filepath.Join("..", "src", "assets", "gen")
	if err := os.MkdirAll(outputDir, 0755); err != nil && !os.IsExist(err) {
		panic(err)
	}

	fmt.Println("Fetching dictionary data...")

	// Fetch data
	ce, err := fetchCEDICT()
	if err != nil {
		panic(err)
	}

	jm, kj, err := fetchJMdict()
	if err != nil {
		panic(err)
	}

	fmt.Println("Generating files...")

	// Generate Japanese files
	if err := generateJapanese(jm, kj, outputDir); err != nil {
		panic(err)
	}

	// Generate Chinese files
	if err := generateChinese(ce, outputDir); err != nil {
		panic(err)
	}

	fmt.Println("Generation complete!")
}

func generateJapanese(jm jmdict.JMdict, kj jmdict.Kanjidic2, outputDir string) error {
	// Generate Kanjidic files
	if err := writeKanjidicKanji(kj, outputDir); err != nil {
		return fmt.Errorf("failed to write kanjidic kanji: %w", err)
	}

	if err := writeKanjidicMeta(kj, outputDir); err != nil {
		return fmt.Errorf("failed to write kanjidic meta: %w", err)
	}

	// Generate JMdict files
	if err := writeJmdictWords(jm, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict words: %w", err)
	}

	if err := writeJmdictMeta(jm, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict meta: %w", err)
	}

	// Generate indexes
	englishIndex := buildJmdictEnglishIndex(jm)
	if err := writeJmdictEnglishIndex(englishIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict english index: %w", err)
	}

	nativeIndex := buildJmdictNativeIndex(jm)
	if err := writeJmdictNativeIndex(nativeIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native index: %w", err)
	}

	return nil
}

func generateChinese(ce cedict.CEDICT, outputDir string) error {
	if err := writeCedictWords(ce, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict words: %w", err)
	}

	englishIndex := buildCedictEnglishIndex(ce)
	if err := writeCedictEnglishIndex(englishIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict english index: %w", err)
	}

	nativeIndex := buildCedictNativeIndex(ce)
	if err := writeCedictNativeIndex(nativeIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict native index: %w", err)
	}

	return nil
}

func writeKanjidicKanji(kj jmdict.Kanjidic2, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "kanjidic-kanji.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, character := range kj.Characters {
		data, err := json.Marshal(character)
		if err != nil {
			return err
		}

		if _, err := file.WriteString(character.Literal); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.Write(data); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func writeKanjidicMeta(kj jmdict.Kanjidic2, outputDir string) error {
	meta := struct {
		jmdict.Kanjidic2DictionaryMetadata
	}{
		Kanjidic2DictionaryMetadata: kj.Kanjidic2DictionaryMetadata,
	}

	data, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outputDir, "kanjidic-meta.json"), data, 0644)
}

func writeJmdictWords(jm jmdict.JMdict, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict-words.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, word := range jm.Words {
		data, err := json.Marshal(word)
		if err != nil {
			return err
		}

		if _, err := file.WriteString(word.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.Write(data); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func writeJmdictNativeIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict-index-native.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, item := range index {
		if _, err := file.WriteString(item.Text); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.WriteString(item.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func writeJmdictMeta(jm jmdict.JMdict, outputDir string) error {
	meta := struct {
		jmdict.JMdictDictionaryMetadata
	}{
		JMdictDictionaryMetadata: jm.JMdictDictionaryMetadata,
	}

	data, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outputDir, "jmdict-meta.json"), data, 0644)
}

type IndexItem struct {
	ID       string
	Text     string
	Common   bool
	Priority float64
}

func buildJmdictEnglishIndex(jm jmdict.JMdict) []IndexItem {
	// Parameters for ordering items in the index
	const (
		c = 10.0 // common weight
		l = 2.0  // length weight
		p = 1.0  // priority weight
	)

	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for _, word := range jm.Words {
		// Add gloss entries
		for senseIdx, sense := range word.Sense {
			allKanji := len(sense.AppliesToKanji) == 1 && sense.AppliesToKanji[0] == "*"
			allKana := len(sense.AppliesToKana) == 1 && sense.AppliesToKana[0] == "*"

			// Check if any applicable kanji/kana are common
			commonKanji := false
			for _, kanji := range word.Kanji {
				if allKanji || contains(sense.AppliesToKanji, kanji.Text) {
					if kanji.Common {
						commonKanji = true
						break
					}
				}
			}

			commonKana := false
			for _, kana := range word.Kana {
				if allKana || contains(sense.AppliesToKana, kana.Text) {
					if kana.Common {
						commonKana = true
						break
					}
				}
			}

			for glossIdx, gloss := range sense.Gloss {
				priority := float64(senseIdx) + float64(glossIdx)/float64(len(sense.Gloss))

				add(IndexItem{
					ID:       word.ID,
					Text:     normalizeEnglish(gloss.Text),
					Common:   commonKanji || commonKana,
					Priority: priority,
				})
			}
		}

		// Clear for next word
		alreadyAdded = make(map[string]bool)
	}

	// Sort index
	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		sortKeyA := getSortKey(a, c, l, p)
		sortKeyB := getSortKey(b, c, l, p)

		if sortKeyA == sortKeyB {
			idA, _ := strconv.Atoi(a.ID)
			idB, _ := strconv.Atoi(b.ID)
			return idA < idB
		}

		return sortKeyA < sortKeyB
	})

	return index
}

func getSortKey(item IndexItem, c, l, p float64) float64 {
	uncommon := 0.0
	if !item.Common {
		uncommon = 1.0
	}
	length := float64(len(item.Text))
	priority := item.Priority

	return c*uncommon + l*length + p*priority
}

func buildJmdictNativeIndex(jm jmdict.JMdict) []IndexItem {
	// Parameters for ordering items in the index
	const (
		c = 10.0 // common weight
		l = 2.0  // length weight
		p = 1.0  // priority weight
	)

	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for _, word := range jm.Words {
		// Add kanji entries
		for _, kanji := range word.Kanji {
			add(IndexItem{
				ID:       word.ID,
				Text:     kanji.Text,
				Common:   kanji.Common,
				Priority: 0,
			})
		}

		// Add kana entries
		for _, kana := range word.Kana {
			add(IndexItem{
				ID:       word.ID,
				Text:     kana.Text,
				Common:   kana.Common,
				Priority: 0,
			})
		}

		// Clear for next word
		alreadyAdded = make(map[string]bool)
	}

	// Sort index
	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		sortKeyA := getSortKey(a, c, l, p)
		sortKeyB := getSortKey(b, c, l, p)

		if sortKeyA == sortKeyB {
			idA, _ := strconv.Atoi(a.ID)
			idB, _ := strconv.Atoi(b.ID)
			return idA < idB
		}

		return sortKeyA < sortKeyB
	})

	return index
}

func writeJmdictEnglishIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict-index-english.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, item := range index {
		if _, err := file.WriteString(item.Text); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.WriteString(item.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func writeCedictNativeIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "cedict-index-native.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, item := range index {
		if _, err := file.WriteString(item.Text); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.WriteString(item.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func writeCedictWords(ce cedict.CEDICT, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "cedict-words.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for i, entry := range ce {
		data, err := json.Marshal(entry)
		if err != nil {
			return err
		}

		if _, err := file.WriteString(strconv.Itoa(i)); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.Write(data); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func buildCedictEnglishIndex(ce cedict.CEDICT) []IndexItem {
	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for i, entry := range ce {
		id := strconv.Itoa(i)

		// Add glosses
		for senseIdx, sense := range entry.Senses {
			for glossIdx, gloss := range sense {
				if strings.TrimSpace(gloss) != "" {
					priority := float64(senseIdx) + float64(glossIdx)/float64(len(sense))

					add(IndexItem{
						ID:       id,
						Text:     normalizeEnglish(gloss),
						Common:   false,
						Priority: priority + 2, // English glosses get lower priority
					})
				}
			}
		}

		// Clear for next entry
		alreadyAdded = make(map[string]bool)
	}

	// Sort index by text length first, then priority
	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		lenA, lenB := len(a.Text), len(b.Text)
		if lenA == lenB {
			if a.Priority == b.Priority {
				idA, _ := strconv.Atoi(a.ID)
				idB, _ := strconv.Atoi(b.ID)
				return idA < idB
			}
			return a.Priority < b.Priority
		}
		return lenA < lenB
	})

	return index
}

func buildCedictNativeIndex(ce cedict.CEDICT) []IndexItem {
	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for i, entry := range ce {
		id := strconv.Itoa(i)

		// Add traditional character
		add(IndexItem{
			ID:       id,
			Text:     entry.Traditional,
			Common:   false,
			Priority: 0,
		})

		// Add simplified character (if different)
		if entry.Simplified != entry.Traditional {
			add(IndexItem{
				ID:       id,
				Text:     entry.Simplified,
				Common:   false,
				Priority: 0,
			})
		}

		// Add pinyin
		for i, pinyin := range processPinyin(entry.Pinyin) {
			add(IndexItem{
				ID:       id,
				Text:     pinyin,
				Common:   false,
				Priority: float64(i) + 1,
			})
		}

		// Clear for next entry
		alreadyAdded = make(map[string]bool)
	}

	// Sort index by text length first, then priority
	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		lenA, lenB := len(a.Text), len(b.Text)
		if lenA == lenB {
			if a.Priority == b.Priority {
				idA, _ := strconv.Atoi(a.ID)
				idB, _ := strconv.Atoi(b.ID)
				return idA < idB
			}
			return a.Priority < b.Priority
		}
		return lenA < lenB
	})

	return index
}

func processPinyin(pinyin []string) []string {
	result := make([]string, 0, len(pinyin))
	for _, p := range pinyin {
		b := strings.Builder{}
		for _, c := range p {
			l := unicode.ToLower(c)
			if 'a' <= l && l <= 'z' {
				b.WriteRune(l)
			}
		}
		result = append(result, b.String())
	}
	return result
}

func writeCedictEnglishIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "cedict-index-english.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, item := range index {
		if _, err := file.WriteString(item.Text); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.WriteString(item.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

func normalizeEnglish(text string) string {
	var result strings.Builder
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			result.WriteRune(unicode.ToLower(r))
		} else if result.Len() > 0 && !strings.HasSuffix(result.String(), " ") {
			result.WriteRune(' ')
		}
	}
	return strings.TrimSpace(result.String())
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
