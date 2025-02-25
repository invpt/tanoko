import json
import jaconv

with open("scripts/jmdict-eng-3.5.0.json") as f:
    jmdata = json.load(f)

with open("scripts/kanjidic2-en-3.5.0.json") as f:
    kjdata = json.load(f)

with open("src/assets/gen/kanjidic-kanji.txt", "w") as f:
    for character in kjdata["characters"]:
        f.write(character["literal"] + "\x1F")
        json.dump(character, f, separators=(",", ":"))
        f.write("\x1E")

with open("src/assets/gen/kanjidic-meta.json", "w") as f:
    copied = kjdata.copy()
    del copied["characters"]
    json.dump(copied, f)

with open("src/assets/gen/jmdict-words.txt", "w") as f:
    for word in jmdata["words"]:
        f.write(word["id"] + "\x1F")
        json.dump(word, f, separators=(",", ":"))
        f.write("\x1E")

with open("src/assets/gen/jmdict-meta.json", "w") as f:
    copied = jmdata.copy()
    del copied["words"]
    json.dump(copied, f)

c = 10
l = 2
p = 1

combined_index = []
for word in jmdata["words"]:
    already_added = set()

    def add(d):
        if (d["text"], d["id"]) not in already_added:
            already_added.add((d["text"], d["id"]))
            combined_index.append(d)

    for kanji in word["kanji"]:
        add({
            "id": word["id"],
            "text": kanji["text"],
            "common": kanji["common"],
            "priority": 0,
        })

    for kana in word["kana"]:
        add({
            "id": word["id"],
            "text": kana["text"],
            "common": kana["common"],
            "priority": 0,
        })

    for sense_idx, sense in enumerate(word["sense"]):
        all_kanji = sense["appliesToKanji"] == ["*"]
        all_kana = sense["appliesToKana"] == ["*"]
        common = (
            any(kanji["common"] for kanji in word["kanji"] if all_kanji or kanji["text"] in sense["appliesToKanji"])
            or any(kana["common"] for kana in word["kana"] if all_kana or kana["text"] in sense["appliesToKana"])
        )

        gloss_count = len(sense["gloss"])
        for gloss_idx, gloss in enumerate(sense["gloss"]):
            priority = sense_idx + gloss_idx / gloss_count
            add({
                "id": word["id"],
                "text": gloss["text"],
                "common": common,
                "priority": priority,
            })

combined_index.sort(key=lambda x: (c * (not x["common"]) + l * len(x["text"]) + p * x["priority"], x["id"]))

def normalize(x: str):
    return jaconv.kata2hira(jaconv.normalize(x.lower()))

with open("src/assets/gen/jmdict-index.txt", "w") as f:
    f.write("\x1E".join(map(lambda x: normalize(x["text"]) + "\x1F" + x["id"], combined_index)) + "\x1E")
