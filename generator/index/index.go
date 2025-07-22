package index

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/english"
)

const COMMON_WORD_COUNT = 16
const COMMON_POSTING_LIST_SIZE = 100

type Builder struct {
	entries map[string][]uint32
	maxID   uint32
}

func NewBuilder() *Builder {
	return &Builder{entries: map[string][]uint32{}}
}

func (b *Builder) Add(text string, id uint32) {
	b.maxID = max(b.maxID, id)
	for _, token := range english.Tokenize(text) {
		b.entries[token] = append(b.entries[token], id)
	}
}

func (b *Builder) Build() *Index {
	for token, ids := range b.entries {
		b.entries[token] = deduplicateAndSort(ids)
	}

	return &Index{
		commonWords: findCommonWords(b.entries),
		entries:     b.entries,
	}
}

func findCommonWords(entries map[string][]uint32) (commonWords []string) {
	type tokenCount struct {
		token string
		count int
	}
	var counts []tokenCount
	for token, ids := range entries {
		counts = append(counts, tokenCount{token: token, count: len(ids)})
	}
	sort.Slice(counts, func(i, j int) bool {
		return counts[i].count > counts[j].count
	})

	fmt.Println("Common words:")
	for i := 0; i < COMMON_WORD_COUNT; i++ {
		fmt.Println("  ", counts[i].token, counts[i].count)
		commonWords = append(commonWords, counts[i].token)
	}

	return
}

func deduplicateAndSort(ids []uint32) []uint32 {
	if len(ids) == 0 {
		return ids
	}

	sort.Slice(ids, func(i, j int) bool {
		return ids[i] < ids[j]
	})

	writeIndex := 1
	for i := 1; i < len(ids); i++ {
		if ids[i] != ids[i-1] {
			ids[writeIndex] = ids[i]
			writeIndex++
		}
	}
	return ids[:writeIndex]
}

type Index struct {
	commonWords []string
	entries     map[string][]uint32
	maxID       uint32
}

func (idx *Index) Export(outputDir, prefix string) error {
	metaPath := filepath.Join(outputDir, prefix+"-english-index-meta.json")
	indexTablePath := filepath.Join(outputDir, prefix+"-english-index-toc.bin")
	stringTablePath := filepath.Join(outputDir, prefix+"-english-index.bin")
	bitflagsPath := filepath.Join(outputDir, prefix+"-english-index-common.bin")

	if err := idx.writeMetadataFile(metaPath); err != nil {
		return fmt.Errorf("failed to write metadata file: %w", err)
	}

	offsets, err := idx.writeStringTableFile(stringTablePath)
	if err != nil {
		return fmt.Errorf("failed to write string table file: %w", err)
	}

	if err := idx.writeWordIndexFile(offsets, indexTablePath); err != nil {
		return fmt.Errorf("failed to write word index file: %w", err)
	}

	if err := idx.writeBitflagsFile(bitflagsPath); err != nil {
		return fmt.Errorf("failed to write bitflags file: %w", err)
	}

	return nil
}

func (idx *Index) writeMetadataFile(filepath string) error {
	metadata := struct {
		CommonWords []string `json:"commonWords"`
	}{
		CommonWords: idx.commonWords,
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

func (idx *Index) writeWordIndexFile(offsets map[string]uint32, filepath string) error {
	var sortedWords []string
	for word := range idx.entries {
		sortedWords = append(sortedWords, word)
	}
	sort.Strings(sortedWords)

	buffer := encode.NewBuffer()

	for _, word := range sortedWords {
		if len(word) > 255 {
			return fmt.Errorf("word '%s' is too long (%d chars, max 255)", word, len(word))
		}

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

func (idx *Index) writeStringTableFile(filepath string) (offsets map[string]uint32, err error) {
	var sortedWords []string
	for word := range idx.entries {
		sortedWords = append(sortedWords, word)
	}
	slices.Sort(sortedWords)

	buffer := encode.NewBuffer()

	offsets = make(map[string]uint32, len(idx.entries))
	for _, word := range sortedWords {
		offsets[word] = uint32(buffer.Offset())

		encode.Raw(buffer, word)

		entries := idx.entries[word]
		if slices.Contains(idx.commonWords, word) && len(entries) > COMMON_POSTING_LIST_SIZE {
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

func (idx *Index) writeBitflagsFile(filepath string) error {
	wordToBit := make(map[string]uint16)
	for i, word := range idx.commonWords {
		wordToBit[word] = uint16(1 << i)
	}

	bitflags := make([]uint16, idx.maxID+1)

	for word, entries := range idx.entries {
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
