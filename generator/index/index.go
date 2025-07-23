package index

import (
	"fmt"
	"io"
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

	for i := range COMMON_WORD_COUNT {
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

func (idx *Index) PrintStats(name string) {
	totalEntries := len(idx.entries)
	totalPostings := 0
	for _, postings := range idx.entries {
		totalPostings += len(postings)
	}
	fmt.Printf("%s: %d terms, %d postings, %d common words\n", name, totalEntries, totalPostings, len(idx.commonWords))
}

func (idx *Index) Export(w io.Writer) (err error) {
	s := encode.NewStream(w)

	var b *encode.Buffer

	if b, err = s.Append(); err != nil {
		return
	}
	offsets, err := idx.exportEntries(b)
	if err != nil {
		return fmt.Errorf("failed to build entries: %w", err)
	}

	if b, err = s.Append(); err != nil {
		return
	}
	if err := idx.exportEntryIndex(b, offsets); err != nil {
		return fmt.Errorf("failed to build: %w", err)
	}

	if b, err = s.Append(); err != nil {
		return
	}
	if err := idx.exportCommonWords(b); err != nil {
		return fmt.Errorf("failed to build common words: %w", err)
	}

	return nil
}

func (idx *Index) exportCommonWords(b *encode.Buffer) (err error) {
	wordToBit := make(map[string]uint16, len(idx.commonWords))
	for i, word := range idx.commonWords {
		wordToBit[word] = uint16(1 << i)
	}

	table := make([]uint16, idx.maxID+1)

	for word, entries := range idx.entries {
		if bitMask, isCommon := wordToBit[word]; isCommon {
			for _, entryID := range entries {
				if int(entryID) < len(table) {
					table[entryID] |= bitMask
				}
			}
		}
	}

	for _, word := range encode.Array(b, idx.commonWords) {
		encode.String(b, word)
	}

	for _, entry := range encode.Array(b, table) {
		encode.Uint16(b, entry)
	}

	return nil
}

func (idx *Index) exportEntryIndex(b *encode.Buffer, offsets map[string]uint32) error {
	var sortedWords []string
	for word := range idx.entries {
		sortedWords = append(sortedWords, word)
	}
	sort.Strings(sortedWords)

	for _, word := range sortedWords {
		if len(word) > 255 {
			return fmt.Errorf("word '%s' is too long (%d chars, max 255)", word, len(word))
		}

		if offsets[word] > 0x7FFFFFFF {
			return fmt.Errorf("offset for word '%s' is too large", word)
		}

		encode.Uint32(b, offsets[word]|uint32(len(word))<<24)
	}

	return nil
}

func (idx *Index) exportEntries(b *encode.Buffer) (map[string]uint32, error) {
	var sortedWords []string
	for word := range idx.entries {
		sortedWords = append(sortedWords, word)
	}
	slices.Sort(sortedWords)

	offsets := make(map[string]uint32, len(idx.entries))
	for _, word := range sortedWords {
		offsets[word] = uint32(b.Offset())

		encode.Raw(b, word)

		entries := idx.entries[word]
		if slices.Contains(idx.commonWords, word) && len(entries) > COMMON_POSTING_LIST_SIZE {
			entries = entries[:COMMON_POSTING_LIST_SIZE]
		}

		for _, entryID := range encode.Array(b, entries) {
			encode.Uvarint(b, entryID)
		}
	}

	return offsets, nil
}
