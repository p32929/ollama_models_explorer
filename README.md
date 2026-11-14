# Ollama Models Explorer

A modern, dark-themed UI for exploring and filtering Ollama AI models. This Next.js application provides an efficient interface to browse, search, and sort through a collection of AI models with multiple filtering options.

**Live:** https://ollama-models-explorer.vercel.app/

![Ollama Models Explorer: coding models that run on a 32 GB laptop](docs/screenshots/desktop.png)

<p align="center">
  <img src="docs/screenshots/compare.png" width="49%" alt="Comparing three models side by side">
  <img src="docs/screenshots/trending.png" width="49%" alt="The Trending view">
</p>

<p align="center">
  <img src="docs/screenshots/phone.png" height="460" alt="On a phone: models are cards">
  <img src="docs/screenshots/phone-picks.png" height="460" alt="Picking what you want to do, several at once">
</p>

## Features

**Every model on Ollama.** The ~270 official models (with every version, size and context window) **and the 17,000+ community models** (`user/model-name`), in Official / Community / All tabs.

**Will it run on my computer?** The page finds your graphics card (or Apple chip) and memory by itself, with nothing to type, and marks every model **Runs well / Tight fit / Too big / Cloud**. If the guess is wrong, one tap picks the closest computer. "Only show what runs on it" hides the rest. (Browsers hide exact specs, so it is an estimate: official models use their real download sizes, the rest are estimated from the parameter count.)

**Find the right one**
- **I want to…** (pick several, a model must match all): Coding, Small & fast, Images, Reasoning, Embeddings, Translation, Chat & roleplay, Math, Tool use
- **Capabilities** (also several): Tools, Vision, Thinking, Embedding, Audio, Cloud…
- **Search** by any words in the name, description or capabilities; **Search ollama.com live** for anything newer than the saved list
- **Filters**: updated recently, size, context window, publisher (click a name), hide near-duplicates, capabilities
- **Sort** by downloads, last update, name, size, context window or versions

**Compare** up to four models side by side (size, context, downloads, whether each runs on your computer).

**What's new / Trending**: models added or updated in the last two weeks, and what is rising. Trending ranks by real download growth once the list has two weekly snapshots, and by downloads plus recent updates until then.

**Made for phones**: models become cards, controls scroll sideways in one row, filters open as a bottom sheet, compare goes full screen, and every tap target is at least 36 px.

**Shareable links**: search, filters, sort and the compare list are saved in the address.

**Light and dark mode**, and a **Model of the week**.

**For developers**
- JSON API: `GET /api/v1/models?q=coder&scope=community&cap=tools&sort=downloads&limit=50` (also `owner`, `updated`, `max_gb`, `min_context_k`, `new=1`, `memory_gb=16` to get a `fit` for that much memory). CORS is open.
- RSS feed of new and updated models: `/feed.xml`

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

```bash
git clone https://github.com/p32929/ollama_models_explorer.git
cd ollama_models_explorer
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Data Source

The official models are read live from ollama.com. The complete list (official and community) comes from `/public/ollama-catalogue.json`. The data includes:

- Model name and description
- Capabilities (chat, vision, etc.)
- Version information
- Size and context window details
- External links

## Technologies

- **Next.js**: React framework for production
- **TypeScript**: Type-safe code
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Component library for the UI elements
- **Lucide React**: Icon library

## Contributing

Contributions are warmly welcomed and greatly appreciated! Whether it's a bug fix, new feature, or improvement, your input helps make this project better for everyone.

Before submitting a pull request, please:

1. Create an issue describing the feature or bug fix you'd like to work on
2. Wait for discussion and approval to ensure alignment with project goals
3. Fork the repository and create your feature branch
4. Submit your pull request with a clear description of changes

This approach helps avoid duplicate efforts and ensures smooth collaboration. Thank you for considering contributing!

## Share

Sharing this repository with your friends is just one click away from here

[![facebook](https://user-images.githubusercontent.com/6418354/179013321-ac1d1452-0689-493f-9066-940cf2302b6e.png)](https://www.facebook.com/sharer/sharer.php?u=https://github.com/p32929/ollama_models_explorer/)
[![twitter](https://user-images.githubusercontent.com/6418354/179013351-7d8d6d1c-4ce2-46ab-bef8-4c4765a1b888.png)](https://twitter.com/intent/tweet?url=https://github.com/p32929/ollama_models_explorer/)
[![tumblr](https://user-images.githubusercontent.com/6418354/179013343-3111f55a-3b90-40c7-8487-9777348672b0.png)](https://www.tumblr.com/share?v=3&u=https://github.com/p32929/ollama_models_explorer/)
[![pocket](https://user-images.githubusercontent.com/6418354/179013334-b095c45f-becf-49f4-9ee1-5a731a9b1f85.png)](https://getpocket.com/save?url=https://github.com/p32929/ollama_models_explorer/)
[![pinterest](https://user-images.githubusercontent.com/6418354/179013331-44cd9206-11b1-4b65-becb-5863b61c828f.png)](https://pinterest.com/pin/create/button/?url=https://github.com/p32929/ollama_models_explorer/)
[![reddit](https://user-images.githubusercontent.com/6418354/179013338-7416ae3f-73ba-4522-86e1-1374d7082d22.png)](https://www.reddit.com/submit?url=https://github.com/p32929/ollama_models_explorer/)
[![linkedin](https://user-images.githubusercontent.com/6418354/179013327-ca7b7102-1da8-4b1c-858f-1a6e5f21bd70.png)](https://www.linkedin.com/shareArticle?mini=true&url=https://github.com/p32929/ollama_models_explorer/)
[![whatsapp](https://user-images.githubusercontent.com/6418354/179013353-f477fa0b-3e6f-4138-a357-c9991b23ff88.png)](https://api.whatsapp.com/send?text=https://github.com/p32929/ollama_models_explorer/)

---

## Support

If this saved you time, you can buy me a coffee — it keeps these projects maintained and free.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-%E2%98%95-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/p32929)

<!-- hire-block -->

---

## 💼 Using this at a company?

I do fixed-price delivery work on my own projects. One invoice, one date, no hourly billing:

| | |
|---|---|
| **White-label build** — this project rebranded, extended and deployed as yours | **$6,500** · 3 weeks |
| **Custom app from scratch** on my own stack, signed and auto-updating | **$12,500** · 6 weeks |
| **Production-hardening sprint** — 72 hours on this project, for your load and your security review | **$999** |
| **Ongoing capacity** — one project-week of my time reserved every month | **$9,000 / month** |

Full details → **[p32929.github.io/hire](https://p32929.github.io/hire/)** · Email **[fayazdevinbox@uberip.com](mailto:fayazdevinbox@uberip.com)** — scoping and quotes are free and I answer within one business day.

### Commercial use of this repo

This repo has **no license file**, which in copyright law means *all rights reserved*.
Personal use, learning and open-source forks: go ahead, just link back. Shipping it inside a
commercial or closed-source product needs a license — **$2,500** for one product, **$9,500**
company-wide and perpetual, signed and issued the same day
([details](https://p32929.github.io/hire/)).
