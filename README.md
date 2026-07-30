# Social Media Manager Extension

An AI-powered Chrome extension that helps creators engage authentically on LinkedIn, X (Twitter), YouTube, and Substack — right from the browser's side panel.

## Features

- **Engage tab** — Scrapes your feed, scores posts by relevance, and generates on-brand reply suggestions
- **Chat tab** — Freeform AI assistant with your voice profile baked in
- **Draft tab** — Turn a topic into a full post draft with one click
- **Queue tab** — Schedule drafts and send them via alarm notifications
- **Competitor Tracking** — Monitor tracked accounts and boost their posts in your feed
- **Post Monitor** — 60-minute comment alerts on posts you engage with
- **Settings** — Voice profile, tone, topic keywords, content library, engagement limits

## Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Chrome Extension Manifest V3 |
| Build | Vite + CRXJS |
| Language | TypeScript (strict) |
| UI | React 18 + TailwindCSS |
| Package Manager | pnpm |
| Testing | Vitest (226 tests) |
| AI Backend | OmniRoute → OpenRouter → LLMs |

## Architecture

```
Side Panel (React UI) ←→ Service Worker ←→ Content Scripts (DOM scrapers)
                               ↓
                       OmniRoute (localhost:20128)
                               ↓
                       OpenRouter → LLM providers
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- [OmniRoute](https://github.com/mukulgadd/omni-route) running locally on port `20128`

### Install & Build

```bash
pnpm install
pnpm build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. The extension appears in your toolbar — click to open the side panel

### Configuration

After loading, go to **Settings** and fill in:
- **Voice Profile** — how you write (tone, style, persona)
- **Topic Keywords** — your expertise areas
- **Content Library** — past posts or writing samples for context
- **AI Auth Key** — your OmniRoute auth key (set in `src/shared/constants.ts` or via Settings)

### Running Tests

```bash
pnpm test
```

### Dev Mode (hot reload for side panel UI)

```bash
pnpm dev
```

## Supported Platforms

| Platform | Scraping | Reply Suggestions | Find Post |
|---|---|---|---|
| LinkedIn | ✅ | ✅ | ✅ |
| X / Twitter | ✅ | ✅ | ✅ |
| YouTube | ✅ | ✅ | ✅ |
| Substack | ✅ | ✅ | ✅ |

## Project Structure

```
src/
├── background/          # Service worker, AI client, prompt templates
├── content-scripts/     # Platform DOM scrapers (LinkedIn, X, YouTube, Substack)
├── sidepanel/           # React UI (Engage, Chat, Draft, Queue, Settings tabs)
├── onboarding/          # 5-step setup wizard
├── config/              # selectors.json (bundled fallback for DOM selectors)
└── shared/              # Types, constants, storage, messages
tests/
├── unit/                # Pure logic modules
└── integration/         # Scraper tests with jsdom
```

## Roadmap

- [ ] Instagram, Facebook, Reddit, TikTok, Threads scrapers
- [ ] DOM injection (reply in-page without copy-paste)
- [ ] Multi-account voice profiles
- [ ] Usage analytics dashboard
- [ ] OAuth / secure key management
- [ ] Chrome Web Store submission

## Notes

- Platform DOMs change frequently. If scraping breaks, update `src/config/selectors.json` or host the file remotely and point `SELECTOR_CONFIG_URL` at it.
- The AI key (`AI_AUTH_KEY` in `src/shared/constants.ts`) is intentionally left blank — set it to your OmniRoute key before building.
- The service worker is stateless between wakes (MV3 constraint) — all state lives in `chrome.storage`.

## License

MIT
