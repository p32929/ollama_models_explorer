# Ollama Models Explorer

A modern, dark-themed UI for exploring and filtering Ollama AI models. This Next.js application provides an efficient interface to browse, search, and sort through a collection of AI models with multiple filtering options.

**Live:** https://ollama-models-explorer.vercel.app/

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
