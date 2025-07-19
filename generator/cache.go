package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const cacheDir = "cache"

// ensureCacheDir creates the cache directory if it doesn't exist
func ensureCacheDir() error {
	return os.MkdirAll(cacheDir, 0755)
}

// getCacheFilePath returns a simple cache file path for a given filename
func getCacheFilePath(filename string) string {
	return filepath.Join(cacheDir, filename)
}

// saveToCache saves data to a cache file
func saveToCache(filename string, data io.Reader) error {
	if err := ensureCacheDir(); err != nil {
		return err
	}

	cachePath := getCacheFilePath(filename)
	file, err := os.Create(cachePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(file, data)
	return err
}

// loadFromCache loads data from a cache file if it exists
func loadFromCache(filename string) (io.ReadCloser, error) {
	cachePath := getCacheFilePath(filename)
	return os.Open(cachePath)
}

// isCached checks if a file exists in cache
func isCached(filename string) bool {
	cachePath := getCacheFilePath(filename)
	_, err := os.Stat(cachePath)
	return err == nil
}

// clearCache removes all cached files
func clearCache() error {
	fmt.Println("Clearing cache...")
	if err := os.RemoveAll(cacheDir); err != nil {
		return err
	}
	fmt.Println("Cache cleared.")
	return nil
}
