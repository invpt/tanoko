# tada no kotoba (tanoko)
A Japanese dictionary with spaced repetition

## Building

tanoko is built with [Bun](https://bun.sh), so install it first.

Next, make sure you've downloaded tanoko's dependencies: run `bun install`.

Before building, you will need to generate the (hefty) dictionary assets.

1. Download and extract the latest versions of `jmdict-eng` and `kanjidic2-en` from [jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases/latest).
2. Place the extracted JSON files into `data/`, making sure they are named `jmdict-eng.json` and `kanjidic2-en.json` respectively.
3. Run `bun run generate/generate.ts`, which will use your dictionary data files to build assets that are placed into `src/assets/gen/`.

Now you can build with `bun run build` or run a dev server with `bun run dev`.
