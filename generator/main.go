package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/invpt/tanoko/generator/fileset"
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

	jm, jmne, kanjidic, err := fetchJMdict()
	if err != nil {
		panic(err)
	}

	_ = kanjidic

	fmt.Println("Generating files...")

	if err := fileset.Export(outputDir, "ce", ce, 0); err != nil {
		panic(err)
	}

	if err := fileset.Export(outputDir, "jm", jm.Words, 0); err != nil {
		panic(err)
	}

	if err := fileset.Export(outputDir, "jmne", jmne.Words, 200_000); err != nil {
		panic(err)
	}

	fmt.Println("Generation complete!")
}
