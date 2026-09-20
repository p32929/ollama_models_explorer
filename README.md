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
