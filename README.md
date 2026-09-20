# Ollama Models Explorer

A modern, dark-themed UI for exploring and filtering Ollama AI models. This Next.js application provides an efficient interface to browse, search, and sort through a collection of AI models with multiple filtering options.

<img width="3024" height="1714" alt="Image" src="https://github.com/user-attachments/assets/48895735-134b-4410-a52d-921fab587dc1" />

## Features

- 🌑 **Dark-themed UI** - Clean, modern interface with a dark color scheme
- 🔍 **Advanced Filtering** - Filter models by search terms or specific capabilities
- 📊 **Sortable Table** - Sort models by name, versions, size, or context window
- 💻 **Compact Layout** - Space-efficient design that maximizes content visibility
- 📱 **Responsive Design** - Works on desktop and mobile devices
- ⚡ **Fast Performance** - Built with Next.js for optimal loading speeds

## Filtering & Sorting

### Search
Use the search bar to filter models by:
- Model name
- Description text
- Capability types
- Size characteristics ("smallest", "largest")
- Context window size ("largest context")
- Version information ("latest")

### Capability Filters
Quickly filter models by their capabilities using the filter buttons:
- Chat
- Vision
- Embedding
- And more...

### Sorting
Sort the model table by clicking column headers:
- Model name (alphabetical)
- Number of versions
- Model size
- Context window size

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Data Source

The application loads model data from a local JSON file located at `/public/ollama.json`. The data structure includes:

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

---

## Support

If this saved you time, you can buy me a coffee — it keeps these projects maintained and free.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-%E2%98%95-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/p32929)

<!-- hire-block -->

---

## 💼 Need this customised — or need it yesterday?

I take fixed-price web & desktop work on my own projects. No hourly billing, no surprise scope:

| | |
|---|---|
| **Drop-in integration** — I wire this into your codebase and hand you a PR that builds | **$45** · 3 days |
| **Priority bug fix or small feature** — jumps ahead of the free issue queue | **$95** · 72 hours |
| **Custom build** — branded, packaged and deployed, source yours | **$130** · 7 days |
| **A full app from scratch** | **from $350** · quoted first |

All prices and how to buy → **[p32929.github.io/hire](https://p32929.github.io/hire/)**  
Or buy through [Fiverr](https://www.fiverr.com/fayazbinsalam) (escrow, ID-verified, 5.0★) — safest for a first job.

Scoping and quotes are free: [open an issue](https://github.com/p32929/hire/issues/new) and describe the job.

### Commercial use of this repo

This repo has **no license file**, which in copyright law means *all rights reserved*.
Personal use, learning and open-source forks: go ahead, just link back. Shipping it inside a
commercial or closed-source product needs a license — **$50** for one product, **$150**
company-wide and perpetual ([details](https://p32929.github.io/hire/)).
Rather not pay? [Ask in an issue](https://github.com/p32929/hire/issues/new) — I may just MIT it.
