package fileset

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/index"
	"github.com/invpt/tanoko/generator/radix"
	"github.com/invpt/wordfreq"
)

type Dictionary[T Entry] struct {
	Name    string
	Entries []T
}

type Entry interface {
	Freq(wf *wordfreq.WordFreq) (float64, error)
	Encode(b *encode.Buffer)
	Native(add func(text string))
	English(add func(text string, senseIndex int))
	Ref() string
}

func Export[T Entry](outputDir string, name string, entries []T, limit int) error {
	d := Dictionary[T]{Name: name, Entries: entries}

	if err := d.sort(); err != nil {
		return err
	}

	if limit > 0 {
		d.Entries = d.Entries[:limit]
	}

	if err := d.exportEntriesAndOffsets(outputDir); err != nil {
		return err
	}

	if err := d.exportNative(outputDir); err != nil {
		return err
	}

	if err := d.exportEnglish(outputDir); err != nil {
		return err
	}

	if err := d.exportRef(outputDir); err != nil {
		return err
	}

	return nil
}

func (d *Dictionary[T]) sort() error {
	wf, err := wordfreq.New()
	if err != nil {
		return fmt.Errorf("failed to initialize wordfreq: %w", err)
	}

	freqs := make(map[string]float64, len(d.Entries))
	for _, entry := range d.Entries {
		freq, err := entry.Freq(wf)
		if err != nil {
			return fmt.Errorf("failed to check word frequency: %w", err)
		}
		freqs[entry.Ref()] = freq
	}

	sort.Slice(d.Entries, func(i, j int) bool {
		return freqs[d.Entries[i].Ref()] > freqs[d.Entries[j].Ref()]
	})

	return nil
}

func (d *Dictionary[T]) exportEntriesAndOffsets(outputDir string) error {
	file, err := os.Create(d.filepath(outputDir, "entries.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	offsets := encode.NewBuffer()

	s := encode.NewStream(file, false)

	for _, word := range d.Entries {
		b, err := s.Append()
		if err != nil {
			return err
		}

		encode.Uint32(offsets, uint32(s.Offset()))

		word.Encode(b)
	}

	if err := s.Flush(); err != nil {
		return err
	}

	encode.Uint32(offsets, uint32(s.Offset()))

	offsetsFile, err := os.Create(d.filepath(outputDir, "offsets.bin"))
	if err != nil {
		return err
	}
	defer offsetsFile.Close()

	if _, err := offsetsFile.Write(offsets.Finish()); err != nil {
		return err
	}

	return nil
}

func (d *Dictionary[T]) exportNative(outputDir string) error {
	tree := radix.New()

	for index, entry := range d.Entries {
		entryIndex := uint32(index)

		entry.Native(func(text string) {
			tree.Add(text, entryIndex)
		})
	}

	tree.PrintStats(d.Name + " native radix tree")

	file, err := os.Create(d.filepath(outputDir, "native.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return tree.Export(file)
}

func (d *Dictionary[T]) exportEnglish(outputDir string) error {
	builder := index.NewBuilder()

	for index, entry := range d.Entries {
		entryIndex := uint32(index)

		entry.English(func(text string, senseIndex int) {
			builder.Add(text, entryIndex, senseIndex)
		})
	}

	idx := builder.Build()
	idx.PrintStats(d.Name + " english inverted index")

	file, err := os.Create(d.filepath(outputDir, "english.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return idx.Export(file)
}

func (d *Dictionary[T]) exportRef(outputDir string) error {
	tree := radix.New()

	for index, entry := range d.Entries {
		entryIndex := uint32(index)

		tree.Add(entry.Ref(), entryIndex)
	}

	tree.PrintStats(d.Name + " ref radix")

	file, err := os.Create(d.filepath(outputDir, "ref.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return tree.Export(file)
}

func (d *Dictionary[T]) filepath(outputDir string, name string) string {
	return filepath.Join(outputDir, d.Name+"-"+name)
}
