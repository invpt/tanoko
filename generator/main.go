package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
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

	outputDir := filepath.Join("..", "src", "assets", "gen")
	if err := os.MkdirAll(outputDir, 0755); err != nil && !os.IsExist(err) {
		panic(err)
	}

	fmt.Println("Fetching dictionary data...")

	ce, err := fetchCEDICT()
	if err != nil {
		panic(err)
	}

	jm, kj, err := fetchJMdict()
	if err != nil {
		panic(err)
	}

	fmt.Println("Generating files...")

	if err := generateJapanese(jm, kj, outputDir); err != nil {
		panic(err)
	}

	if err := generateChinese(ce, outputDir); err != nil {
		panic(err)
	}

	fmt.Println("Generation complete!")
}

// resultIDMap provides mapping from string keys to unique uint32 IDs
type resultIDMap struct {
	mapping map[string]uint32
	nextID  uint32
}

func newResultIDMap() *resultIDMap {
	return &resultIDMap{
		mapping: make(map[string]uint32),
		nextID:  0,
	}
}

func (r *resultIDMap) GetID(key string) uint32 {
	if id, exists := r.mapping[key]; exists {
		return id
	}
	id := r.nextID
	r.mapping[key] = id
	r.nextID++
	return id
}
