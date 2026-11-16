# Ollama Models Explorer

**Find the right Ollama model for your computer.** Search all 17,000+ models, see which ones can run on your hardware and how fast, compare them, and copy the install command.

**Live:** https://ollama-models-explorer.vercel.app/ (see [Please self-host it](#please-self-host-it))

![Ollama Models Explorer: every model, with a filter panel and what runs on your computer](docs/screenshots/desktop.png)

## Why I built this

Like many people, I want to run local models. But on Ollama's own website you cannot see what you need to choose one. It does not tell you which models will run on a computer like mine, how big each one really is, or how fast it will be. I do not have high-end hardware, so a wrong pick means a big download that is too slow or does not run at all.

So I made a list I can actually decide from. It finds your computer on its own, then shows for every model: can it run here, how many tokens per second to expect, the size, the context window and what it is good at. Filters like "Coding" or "Small & fast" cut 17,000 models down to a few you can try. I hope it saves you the same trouble.

## Please self-host it

The public site runs on a free host. It is not very fast and it is not always up. **If you can, run your own copy.** It takes a minute, it is faster on your machine, and it works offline once the list is saved:

```bash
git clone https://github.com/p32929/ollama_models_explorer.git
cd ollama_models_explorer
yarn install && yarn dev     # then open http://localhost:3000
```

Or deploy it to Vercel, Netlify or any Node host. If you like it, a star on GitHub helps other people find it.

## Screenshots

**Pick what you want to do.** Tick "Coding" and "Small & fast", and hide everything your computer cannot run:

![Coding and small models that can run on this computer](docs/screenshots/filter-small-coding.png)

**Sort by the fastest on your computer.** Official models with tool support, fastest first, with an estimate of tokens per second:

![Fastest models on this computer](docs/screenshots/fastest.png)

**Filter by what a model can do.** For example, official models that understand images:

![Vision models](docs/screenshots/vision.png)

<p align="center">
  <img src="docs/screenshots/whats-new.png" width="49%" alt="What's new: models added or updated recently">
  <img src="docs/screenshots/trending.png" width="49%" alt="Trending: what is rising">
</p>

<p align="center">
  <img src="docs/screenshots/tooltips.png" width="49%" alt="Hover any number or badge, like MoE, for a plain-words explanation">
  <img src="docs/screenshots/details.png" width="49%" alt="Details panel: can it run, how fast, install command, every version">
</p>

<p align="center">
  <img src="docs/screenshots/compare.png" width="49%" alt="Comparing three models side by side">
</p>

**On a phone**, the filters open as a bottom sheet and each model is a card:

<p align="center">
  <img src="docs/screenshots/phone.png" height="460" alt="Models on a phone">
  <img src="docs/screenshots/phone-filters.png" height="460" alt="The filters on a phone">
  <img src="docs/screenshots/phone-details.png" height="460" alt="The details panel on a phone">
</p>

## Features

**Every model on Ollama.** The ~270 official models (with every version, size and context window) **and the 17,000+ community models** (`user/model-name`), Choose All, Official or Community in the filter panel.

**Will it run on my computer, and how fast?** The page finds your graphics card (or Apple chip) and memory by itself, with nothing to type, marks every model **Can run well / Barely fits / Too big to run / Cloud**, and estimates **tokens per second** (about 0.75 words each), for example `~27 tokens/s`. If the guess is wrong, one tap picks the closest computer. "Only show models that can run on it" hides the rest. (Browsers hide exact specs, so it is an estimate. Speed = memory speed × 0.65 ÷ the model's size; mixture-of-experts models, which only use part of themselves for each word, are handled; expect ±30%. Official models use real download sizes, the rest are estimated from the parameter count.)

**Every row shows the facts up front:** the size range (for example `8B – 405B`), the download size, and the type: **Dense** (all of the model works for every word) or **MoE** (mixture of experts: only a few parts work for each word, so it is faster than its size suggests). No clicking needed.

**Hover anything** (a badge, a number, a tab, a button) for a tooltip that says in plain words what it means and how it was worked out.

**Click any model** for a details panel (it shows a loading shimmer while the versions load): will it run and how fast, the exact `ollama run` command (with a copy button, including the best version for your computer), every version with its size and speed, context window, downloads and more.

**Find the right one**
1. **I want to…** (pick several, a model must match all): Coding, Small & fast, Images, Reasoning, Embeddings, Translation, Chat & roleplay, Math, Tool use
2. **Capabilities** (also several): Tools, Vision, Thinking, Embedding, Audio, Cloud…
3. **Search** by any words in the name, description or capabilities; **Search ollama.com live** for anything newer than the saved list
4. **Filters**: updated recently, size, context window, publisher (click a name), hide near-duplicates, capabilities
5. **Sort** by downloads, last update, name, size, context window, versions or **speed on your computer**; **filter** by minimum speed (10, 20 or 40+ tokens/s)
6. **At a glance**: how many models can run on your computer, how many are fast, how many are new
7. **Always-open filter panel** on the left, so you can see and change every filter at once

**Compare** up to four models side by side (size, context, downloads, whether each runs on your computer).

**What's new / Trending**: models added or updated in the last two weeks, and what is rising. Trending ranks by real download growth once the list has two weekly snapshots, and by downloads plus recent updates until then.

**Made for phones**: models stack as cards, filters open as a bottom sheet, compare goes full screen, and every button is easy to tap.

**Shareable links**: search, filters, sort and the compare list are saved in the address.

**Light and dark mode**, and a **Model of the week**.

**For developers**
1. JSON API: `GET /api/v1/models?q=coder&scope=community&cap=tools&sort=downloads&limit=50` (also `owner`, `updated`, `max_gb`, `min_context_k`, `new=1`, `memory_gb=16&bandwidth_gbs=200` to get a `fit` and an estimated `tokens_per_second` for that computer, `min_tps=20`, `sort=speed`). CORS is open.
2. RSS feed of new and updated models: `/feed.xml`

### Where the full list comes from

ollama.com has no "list everything" page, so a small crawler builds `public/ollama-catalogue.json`:

```bash
node scripts/crawl-catalogue.mjs           # about 20 minutes, no dependencies
node scripts/crawl-catalogue.mjs --quick   # a 1-minute sample (written to a temporary file)
```

Each run compares with the previous list to record when a model first appeared and how many downloads it gained. A GitHub Action (`.github/workflows/update-catalogue.yml`) runs it every week and commits the new list.

### Tests

```bash
yarn test         # the logic: fit, device detection, filters, links (Node 22.6+)
yarn test:e2e     # browser tests on desktop and phone sizes, plus the API (uses your installed Chrome)
```

## Getting Started

See [Please self-host it](#please-self-host-it). `npm run dev` or `pnpm dev` work too. Open http://localhost:3000.

## Data Source

The official models are read live from ollama.com. The complete list (official and community) comes from `/public/ollama-catalogue.json`. The data includes:

1. Model name and description
2. Capabilities (chat, vision, etc.)
3. Version information
4. Size and context window details
5. External links

## Built with

1. **Next.js**: React framework for production
2. **TypeScript**: Type-safe code
3. **Tailwind CSS**: Utility-first CSS framework
4. **shadcn/ui**: Component library for the UI elements
5. **Lucide React**: Icon library

## Contributing

Contributions are very welcome, thank you! Before you start on a pull request, please open an issue and tell me what you would like to add or change. That way we can agree on it first, and your time is not wasted on something that might not fit. Thanks for helping make Ollama Models Explorer better.

## Share

<a href="https://p32929.github.io/share/?repo=ollama_models_explorer"><img src="https://p32929.github.io/readme/share.svg" alt="Share this with your friends in just a click" width="420"></a>

## Support

<a href="https://p32929.github.io/support/"><img src="https://p32929.github.io/readme/support.svg" alt="If you like my works and want to support me, feel free to support" width="420"></a>
