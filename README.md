# Artha Terminal — India Market Intelligence

A React + TypeScript + Vite web app: live news, FII/DII flows, tenders, watchlists,
alerts, a stock screener, and the "Chanakya Watch" speculation module.

## Tech stack
- React 19 + TypeScript
- Vite 7
- Tailwind CSS + shadcn/ui components
- Recharts for charts
- Client-side data fetching via public CORS proxies (no API keys required)

## Local development
```bash
npm install
npm run dev
```

## Build for production
```bash
npm run build
```
Output goes to the `dist/` folder.

## Deployment
This repo is set up to deploy automatically on **Vercel** or **Netlify** —
just import the repo, and it will auto-detect the Vite build settings.

## Project structure
```
src/
  sections/    Page sections (NewsFeed, WatchlistView, StockView, Chanakya, etc.)
  lib/         Data fetching, parsing, caching, sentiment, screener logic
  hooks/       Custom React hooks
  components/  Shared UI components (shadcn/ui)
```
