import json
import jaconv

with open("scripts/jmdict-eng-3.5.0.json") as f:
    jmdata = json.load(f)

with open("scripts/kanjidic2-en-3.5.0.json") as f:
    kjdata = json.load(f)

with open("src/assets/kanjidic-kanji.txt", "w") as f:
    for character in kjdata["characters"]:
        f.write(character["literal"] + "\x1F")
        json.dump(character, f, separators=(",", ":"))
        f.write("\x1E")

with open("src/assets/kanjidic-meta.json", "w") as f:
    copied = kjdata.copy()
    del copied["characters"]
    json.dump(copied, f)

for word in jmdata["words"]:
    pass

with open("src/assets/jmdict-words.txt", "w") as f:
    for word in jmdata["words"]:
        f.write(word["id"] + "\x1F")
        json.dump(word, f, separators=(",", ":"))
        f.write("\x1E")

with open("src/assets/jmdict-meta.json", "w") as f:
    copied = jmdata.copy()
    del copied["words"]
    json.dump(copied, f)

combined_index = []
for word in jmdata["words"]:
    already_added = set()

    def add(d):
        if (d["text"], d["word_id"]) not in already_added:
            already_added.add((d["text"], d["word_id"]))
            combined_index.append(d)

    any_common = False
    for kanji in word["kanji"]:
        if kanji["common"]:
            any_common = True
        add({
            "text": kanji["text"],
            "word_id": word["id"],
            "common": kanji["common"],
            "sense_idx": 0,
        })
        
    for kana in word["kana"]:
        if kana["common"]:
            any_common = True
        add({
            "text": kana["text"],
            "word_id": word["id"],
            "common": kana["common"],
            "sense_idx": 0,
        })
    
    for sense_idx, sense in enumerate(word["sense"]):
        for gloss in sense["gloss"]:
            add({
                "text": gloss["text"],
                "word_id": word["id"],
                "common": any_common,
                "sense_idx": sense_idx,
            })
    
combined_index.sort(key=lambda x: [len(x["text"]), not x["common"], x["sense_idx"]])

def normalize(x: str):
    return jaconv.kata2hira(jaconv.normalize(x.lower()))

with open("src/assets/jmdict-index.txt", "w") as f:
    f.write("\x1E".join(map(lambda x: normalize(x["text"]) + "\x1F" + x["word_id"], combined_index)) + "\x1E")
