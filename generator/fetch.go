package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/invpt/tanoko/generator/cedict"
	"github.com/invpt/tanoko/generator/jmdict"
)

var jmdictSimplifiedReleasesUrl = "https://api.github.com/repos/scriptin/jmdict-simplified/releases"
var cedictURL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"

type githubRelease struct {
	Assets []githubReleaseAsset
}

type githubReleaseAsset struct {
	Name               string
	BrowserDownloadUrl string `json:"browser_download_url"`
}

var client = &http.Client{Timeout: 10 * time.Second}

func fetchJMdict() (jm jmdict.JMdict, kj jmdict.Kanjidic2, err error) {
	// Check cache first
	if isCached("jmdict.json") && isCached("kanjidic2.json") {
		fmt.Println("Using cached JMdict data")

		jmdictFile, err := loadFromCache("jmdict.json")
		if err != nil {
			return jm, kj, err
		}
		defer jmdictFile.Close()

		if err := json.NewDecoder(jmdictFile).Decode(&jm); err != nil {
			return jm, kj, err
		}

		kanjidicFile, err := loadFromCache("kanjidic2.json")
		if err != nil {
			return jm, kj, err
		}
		defer kanjidicFile.Close()

		if err := json.NewDecoder(kanjidicFile).Decode(&kj); err != nil {
			return jm, kj, err
		}

		return jm, kj, nil
	}

	fmt.Println("Downloading JMdict data...")
	releases := []githubRelease{}
	err = fetchJson(jmdictSimplifiedReleasesUrl, &releases)
	if err != nil {
		return
	}

	if len(releases) == 0 {
		err = errors.New("no JMdict releases found")
		return
	}

	latestRelease := releases[0]

	var jmdictUrl, kanjidicUrl string
	for _, asset := range latestRelease.Assets {
		if strings.HasSuffix(asset.Name, ".json.tgz") {
			if strings.HasPrefix(asset.Name, "jmdict-eng") {
				jmdictUrl = asset.BrowserDownloadUrl
			} else if strings.HasPrefix(asset.Name, "kanjidic2-en") {
				kanjidicUrl = asset.BrowserDownloadUrl
			}
		}
	}

	if jmdictUrl == "" || kanjidicUrl == "" {
		err = errors.New("did not find JMdict and/or Kanjidic URL")
		return
	}

	err = fetchJsonFromTarGzAndCache(jmdictUrl, "jmdict.json", &jm)
	if err != nil {
		return
	}

	err = fetchJsonFromTarGzAndCache(kanjidicUrl, "kanjidic2.json", &kj)
	if err != nil {
		return
	}

	return
}

func fetchJson(url string, target any) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	err = json.NewDecoder(resp.Body).Decode(target)
	if err != nil {
		return err
	}

	return nil
}

func fetchJsonFromTarGzAndCache(url, cacheFilename string, target any) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	gzr, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		if strings.HasSuffix(header.Name, ".json") {
			// Read the JSON data
			var buf strings.Builder
			if _, err := io.Copy(&buf, tr); err != nil {
				return err
			}

			jsonData := buf.String()

			// Decode the JSON
			if err := json.NewDecoder(strings.NewReader(jsonData)).Decode(target); err != nil {
				return err
			}

			// Cache the JSON data
			if err := saveToCache(cacheFilename, strings.NewReader(jsonData)); err != nil {
				fmt.Printf("Warning: failed to cache %s: %v\n", cacheFilename, err)
			}

			return nil
		}
	}

	return errors.New("no JSON file found in tar.gz archive")
}

func fetchCEDICT() (ce cedict.CEDICT, err error) {
	// Check cache first
	if isCached("cedict.txt.gz") {
		fmt.Println("Using cached CEDICT data")

		cachedFile, err := loadFromCache("cedict.txt.gz")
		if err != nil {
			return ce, err
		}
		defer cachedFile.Close()

		gzr, err := gzip.NewReader(cachedFile)
		if err != nil {
			return ce, err
		}
		defer gzr.Close()

		ce, err = cedict.Parse(gzr)
		return ce, err
	}

	fmt.Println("Downloading CEDICT data...")
	resp, err := client.Get(cedictURL)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	// Save to cache and parse at the same time
	var buf strings.Builder
	teeReader := io.TeeReader(resp.Body, &buf)

	gzr, err := gzip.NewReader(teeReader)
	if err != nil {
		return
	}
	defer gzr.Close()

	ce, err = cedict.Parse(gzr)
	if err != nil {
		return
	}

	// Cache the downloaded data
	if err := saveToCache("cedict.txt.gz", strings.NewReader(buf.String())); err != nil {
		fmt.Printf("Warning: failed to cache CEDICT: %v\n", err)
	}

	return
}
