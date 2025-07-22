package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"

	"github.com/invpt/tanoko/generator/cedict"
	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/jmdict"
)

// InvertedIndex represents an English word to entry ID mapping
type InvertedIndex struct {
	WordToEntries map[string][]uint32
	CommonWords   []string
	TotalEntries  int
}

// IndexMetadata represents metadata stored in JSON
type IndexMetadata struct {
	CommonWords []string `json:"common_words"`
}

// IndexEntry represents a single entry in the word index table
type IndexEntry struct {
	WordOffset uint32 // Only use 3 bytes when writing
	WordLength uint8  // 1 byte - max 255 chars
}

const (
	COMMON_POSTING_LIST_SIZE = 100 // Cap posting lists at this size for common words
	MAX_COMMON_WORDS         = 16  // Number of most common words to track
)

// buildJmdictEnglishInvertedIndex builds an inverted index from JMdict
func buildJmdictEnglishInvertedIndex(jm jmdict.JMdict, idMap *resultIDMap) (*InvertedIndex, error) {
	index := &InvertedIndex{
		WordToEntries: make(map[string][]uint32),
		TotalEntries:  len(jm.Words),
	}

	// Build word to entries mapping
	for _, word := range jm.Words {
		entryID := idMap.GetID(word.ID)

		for _, sense := range word.Sense {
			for _, gloss := range sense.Gloss {
				tokens := tokenizeEnglish(gloss.Text)
				for _, token := range tokens {
					index.WordToEntries[token] = append(index.WordToEntries[token], entryID)
				}
			}
		}
	}

	// Identify top common words based on frequency
	index.CommonWords = identifyTopCommonWords(index.WordToEntries)

	// Remove duplicates and sort posting lists
	for word, entries := range index.WordToEntries {
		unique := removeDuplicatesSorted(entries)
		index.WordToEntries[word] = unique
	}

	return index, nil
}

// buildCedictEnglishInvertedIndex builds an inverted index from CEDICT
func buildCedictEnglishInvertedIndex(ce cedict.CEDICT, idMap *resultIDMap) (*InvertedIndex, error) {
	index := &InvertedIndex{
		WordToEntries: make(map[string][]uint32),
	}

	// Build word to entries mapping
	for _, entry := range ce {
		entryID := idMap.GetID(entry.Traditional)

		for _, senses := range entry.Senses {
			for _, gloss := range senses {
				cleanedGloss := stripSquareBrackets(gloss)
				tokens := tokenizeEnglish(cleanedGloss)
				for _, token := range tokens {
					index.WordToEntries[token] = append(index.WordToEntries[token], entryID)
				}
			}
		}
	}

	// Identify top common words based on frequency
	index.CommonWords = identifyTopCommonWords(index.WordToEntries)

	// Remove duplicates and sort posting lists
	for word, entries := range index.WordToEntries {
		unique := removeDuplicatesSorted(entries)
		index.WordToEntries[word] = unique
	}

	return index, nil
}

// identifyTopCommonWords finds the top most frequent words
func identifyTopCommonWords(wordToEntries map[string][]uint32) []string {
	type wordFreq struct {
		word string
		freq int
	}

	var wordFreqs []wordFreq
	for word, entries := range wordToEntries {
		wordFreqs = append(wordFreqs, wordFreq{word: word, freq: len(entries)})
	}

	// Sort by frequency (descending)
	sort.Slice(wordFreqs, func(i, j int) bool {
		return wordFreqs[i].freq > wordFreqs[j].freq
	})

	// Take top MAX_COMMON_WORDS
	maxWords := MAX_COMMON_WORDS
	if len(wordFreqs) < maxWords {
		maxWords = len(wordFreqs)
	}

	commonWords := make([]string, maxWords)
	for i := 0; i < maxWords; i++ {
		commonWords[i] = wordFreqs[i].word
	}

	return commonWords
}

// removeDuplicatesSorted removes duplicates from a slice and returns it sorted
func removeDuplicatesSorted(entries []uint32) []uint32 {
	if len(entries) == 0 {
		return entries
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i] < entries[j]
	})

	// Remove duplicates
	result := make([]uint32, 0, len(entries))
	result = append(result, entries[0])

	for i := 1; i < len(entries); i++ {
		if entries[i] != entries[i-1] {
			result = append(result, entries[i])
		}
	}

	return result
}

// writeInvertedIndex writes the inverted index to binary files
func writeInvertedIndex(index *InvertedIndex, outputDir, prefix string) error {
	metaPath := filepath.Join(outputDir, prefix+"-english-index.meta.json")
	indexTablePath := filepath.Join(outputDir, prefix+"-english-index.idx")
	stringTablePath := filepath.Join(outputDir, prefix+"-english-index.bin")
	bitflagsPath := filepath.Join(outputDir, prefix+"-english-bitflags.bin")

	if err := writeMetadataFile(index, metaPath); err != nil {
		return fmt.Errorf("failed to write metadata file: %w", err)
	}

	offsets, err := writeStringTableFile(index, stringTablePath)
	if err != nil {
		return fmt.Errorf("failed to write string table file: %w", err)
	}

	if err := writeWordIndexFile(index, offsets, indexTablePath); err != nil {
		return fmt.Errorf("failed to write word index file: %w", err)
	}

	if err := writeBitflagsFile(index, bitflagsPath); err != nil {
		return fmt.Errorf("failed to write bitflags file: %w", err)
	}

	return nil
}

// writeMetadataFile writes the metadata JSON file
func writeMetadataFile(index *InvertedIndex, filepath string) error {
	metadata := IndexMetadata{
		CommonWords: index.CommonWords,
	}

	file, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(metadata)
}

// writeWordIndexFile writes the word index table as a binary file
func writeWordIndexFile(index *InvertedIndex, offsets map[string]uint32, filepath string) error {
	// Sort words for consistent output
	var sortedWords []string
	for word := range index.WordToEntries {
		sortedWords = append(sortedWords, word)
	}
	sort.Strings(sortedWords)

	// Build the index using the encoder
	buffer := encode.NewBuffer()

	for _, word := range sortedWords {
		// Validate word length (max 255 chars for 1 byte)
		if len(word) > 255 {
			return fmt.Errorf("word '%s' is too long (%d chars, max 255)", word, len(word))
		}

		// Write offset as 3 bytes (little-endian)
		encode.Uint32(buffer, offsets[word]|uint32(len(word))<<24)
	}

	// Write to file
	file, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = file.Write(buffer.Finish())
	return err
}

// writeStringTableFile writes the string table and posting lists
func writeStringTableFile(index *InvertedIndex, filepath string) (offsets map[string]uint32, err error) {
	var sortedWords []string
	for word := range index.WordToEntries {
		sortedWords = append(sortedWords, word)
	}
	slices.Sort(sortedWords)

	buffer := encode.NewBuffer()

	offsets = make(map[string]uint32, len(index.WordToEntries))
	for _, word := range sortedWords {
		offsets[word] = uint32(buffer.Offset())

		encode.Raw(buffer, word)

		entries := index.WordToEntries[word]
		if isCommonWord(word, index.CommonWords) && len(entries) > COMMON_POSTING_LIST_SIZE {
			entries = entries[:COMMON_POSTING_LIST_SIZE]
		}

		for _, entryID := range encode.Array(buffer, entries) {
			encode.Uvarint(buffer, entryID)
		}
	}

	file, err := os.Create(filepath)
	if err != nil {
		return
	}
	defer file.Close()

	_, err = file.Write(buffer.Finish())
	return
}

// writeBitflagsFile writes the bitflags binary file
func writeBitflagsFile(index *InvertedIndex, filepath string) error {
	// Validate we don't have more than 16 common words (to fit in uint16)
	if len(index.CommonWords) > 16 {
		return fmt.Errorf("too many common words: %d (max 16)", len(index.CommonWords))
	}

	wordToBit := make(map[string]uint16)
	for i, word := range index.CommonWords {
		wordToBit[word] = uint16(1 << i)
	}

	bitflags := make([]uint16, index.TotalEntries)

	for word, entries := range index.WordToEntries {
		if bitMask, isCommon := wordToBit[word]; isCommon {
			for _, entryID := range entries {
				if int(entryID) < len(bitflags) {
					bitflags[entryID] |= bitMask
				}
			}
		}
	}

	buffer := encode.NewBuffer()
	for _, flags := range bitflags {
		encode.Uint16(buffer, flags)
	}

	file, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = file.Write(buffer.Finish())
	return err
}

// isCommonWord checks if a word is in the common words list
func isCommonWord(word string, commonWords []string) bool {
	for _, common := range commonWords {
		if word == common {
			return true
		}
	}
	return false
}

// generateJmdictEnglishIndex generates the English inverted index for JMdict
func generateJmdictEnglishIndex(jm jmdict.JMdict, idMap *resultIDMap, outputDir string) error {
	fmt.Println("Building JMdict English inverted index...")

	index, err := buildJmdictEnglishInvertedIndex(jm, idMap)
	if err != nil {
		return fmt.Errorf("failed to build JMdict inverted index: %w", err)
	}

	if err := writeInvertedIndex(index, outputDir, "jmdict"); err != nil {
		return fmt.Errorf("failed to write JMdict inverted index: %w", err)
	}

	// Print statistics
	printInvertedIndexStats("JMdict", index)

	return nil
}

// generateCedictEnglishIndex generates the English inverted index for CEDICT
func generateCedictEnglishIndex(ce cedict.CEDICT, idMap *resultIDMap, outputDir string) error {
	fmt.Println("Building CEDICT English inverted index...")

	index, err := buildCedictEnglishInvertedIndex(ce, idMap)
	if err != nil {
		return fmt.Errorf("failed to build CEDICT inverted index: %w", err)
	}

	if err := writeInvertedIndex(index, outputDir, "cedict"); err != nil {
		return fmt.Errorf("failed to write CEDICT inverted index: %w", err)
	}

	// Print statistics
	printInvertedIndexStats("CEDICT", index)

	return nil
}

// printInvertedIndexStats prints statistics about the inverted index
func printInvertedIndexStats(name string, index *InvertedIndex) {
	fmt.Printf("\n=== %s English Inverted Index Statistics ===\n", name)
	fmt.Printf("Total dictionary entries: %d\n", index.TotalEntries)
	fmt.Printf("Unique English words: %d\n", len(index.WordToEntries))
	fmt.Printf("Common words (capped): %d\n", len(index.CommonWords))

	// Calculate total posting list entries
	totalPostingEntries := 0
	cappedEntries := 0
	for word, entries := range index.WordToEntries {
		if isCommonWord(word, index.CommonWords) && len(entries) > COMMON_POSTING_LIST_SIZE {
			totalPostingEntries += COMMON_POSTING_LIST_SIZE
			cappedEntries += len(entries) - COMMON_POSTING_LIST_SIZE
		} else {
			totalPostingEntries += len(entries)
		}
	}

	fmt.Printf("Total posting list entries: %d\n", totalPostingEntries)
	if cappedEntries > 0 {
		fmt.Printf("Entries capped (saved): %d\n", cappedEntries)
	}

	// Show common words with their frequencies
	if len(index.CommonWords) > 0 {
		fmt.Printf("\nTop %d most common words:\n", len(index.CommonWords))
		for i, word := range index.CommonWords {
			originalCount := len(index.WordToEntries[word])
			if originalCount > COMMON_POSTING_LIST_SIZE {
				fmt.Printf("  %2d. %-12s %d entries (capped to %d)\n", i+1, word, originalCount, COMMON_POSTING_LIST_SIZE)
			} else {
				fmt.Printf("  %2d. %-12s %d entries\n", i+1, word, originalCount)
			}
		}
	}

	// Estimate file sizes (rough estimates since varints vary)
	metadataSize := 200                                // JSON metadata file (rough estimate)
	wordIndexTableSize := len(index.WordToEntries) * 4 // 4 bytes per entry
	stringTableSize := 0
	for word := range index.WordToEntries {
		stringTableSize += len(word)
	}
	// Conservative estimate: ~2 bytes per varint on average
	postingListsSize := totalPostingEntries*2 + len(index.WordToEntries)*3 // varints + counts
	bitflagsSize := index.TotalEntries * 2

	stringTableFileSize := stringTableSize + postingListsSize

	fmt.Printf("\nEstimated file sizes:\n")
	fmt.Printf("  Metadata (.meta.json): %.1f KB\n", float64(metadataSize)/1024.0)
	fmt.Printf("  Word index (.idx): %.1f KB\n", float64(wordIndexTableSize)/1024.0)
	fmt.Printf("  String table (.bin): %.1f KB\n", float64(stringTableFileSize)/1024.0)
	fmt.Printf("  Bitflags: %.1f KB\n", float64(bitflagsSize)/1024.0)
	fmt.Printf("  Total: %.1f KB\n", float64(metadataSize+wordIndexTableSize+stringTableFileSize+bitflagsSize)/1024.0)

	fmt.Println()
}
