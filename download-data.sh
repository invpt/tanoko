#!/bin/bash

curl -sL https://api.github.com/repos/scriptin/jmdict-simplified/releases > data/releases.json

JMDICT_URL=$(cat data/releases.json | jq -r '[.[0].assets[] | select(.name | startswith("jmdict-eng") and endswith(".json.tgz")) | .browser_download_url][0]')
KANJIDIC_URL=$(cat data/releases.json | jq -r '[.[0].assets[] | select(.name | startswith("kanjidic2-en") and endswith(".json.tgz")) | .browser_download_url][0]')

rm data/releases.json

curl -o data/jmdict-eng.json.tgz -sL $JMDICT_URL
curl -o data/kanjidic2-en.json.tgz -sL $KANJIDIC_URL

JMDICT_FILE=$(tar -xvf data/jmdict-eng.json.tgz -C data/)
KANJIDIC_FILE=$(tar -xvf data/kanjidic2-en.json.tgz -C data/)

mv data/$JMDICT_FILE data/jmdict-eng.json
mv data/$KANJIDIC_FILE data/kanjidic2-en.json

rm data/jmdict-eng.json.tgz
rm data/kanjidic2-en.json.tgz
