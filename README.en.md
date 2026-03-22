# PeekaUsage

[中文 README](./README.md)

> A small desktop widget that lives in the corner of your screen and lets you quickly check OpenAI, Anthropic, and OpenRouter subscription quotas, API usage, budget, balance, and rate limits without constantly bouncing between terminals and dashboards.

<p align="center">
  <a href="https://github.com/StarChen4/PeekaUsage/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/StarChen4/PeekaUsage?label=release" /></a>
  <a href="https://github.com/StarChen4/PeekaUsage/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/StarChen4/PeekaUsage" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue" />
  <img alt="Built with" src="https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-orange" />
</p>

<p align="center">
  <img src="./src/assets/Overview.png" alt="PeekaUsage overview" width="280" />
  <img src="./src/assets/Overview1.png" alt="PeekaUsage view 1" width="280" />
  <img src="./src/assets/Overview2.png" alt="PeekaUsage view 2" width="280" />
  <img src="./src/assets/Overview3.png" alt="PeekaUsage view 3" width="280" />
</p>

## What Problem It Solves

If you actively use Claude Code, Codex, OpenClaw, or your own scripts against OpenAI / Anthropic / OpenRouter APIs, you probably know the routine:

- You want to know how much quota is left
- You keep opening a CLI and running `/usage` or `/status`
- Or you bounce across multiple provider dashboards
- Meanwhile you also care about budgets, balances, rate limits, and subscription windows

PeekaUsage does one thing really well: **it pins those numbers to your desktop so they are always one glance away.**

It is not a new model gateway or another chat wrapper. It is a lightweight desktop widget for answering the questions you actually care about during the day:

- How much have I spent?
- How much is left?
- Which provider is about to hit its limit?
- Do I need to switch keys, switch accounts, or stop burning tokens?

## Who It Is For

- Developers who actively use both OpenAI and Anthropic subscriptions
- People using Claude Code / Codex while also calling APIs directly
- Anyone who wants always-visible usage data instead of terminal and dashboard hopping
- Individuals or small teams who care about costs, rate limits, and subscription windows

## Core Features

### Multi-provider overview

- Usage-based spend, budget, balance, and rate limits for OpenAI, Anthropic, and OpenRouter
- Subscription usage windows for OpenAI and Anthropic
- A single desktop widget instead of multiple dashboards and CLI commands

### OAuth and API key workflows

- Auto-detects OAuth tokens from local Claude Code and Codex CLI credentials
- Includes links to official auth guides
- Lets each provider store multiple named API keys
- Supports validation, cleanup, and one-click switching of the active system environment variable

### Built for everyday desktop use

- Manual refresh for the whole widget, per-card refresh, and tray refresh
- Auto refresh and manual-only modes
- Refresh intervals configurable in seconds or minutes
- Provider-specific polling overrides
- Drag-and-drop card ordering with persistence
- Detailed and compact display modes
- Light, dark, and system themes
- Always-on-top mode and window opacity controls
- Tray actions for show, hide, refresh, and settings
- Instant language switching between Simplified Chinese, Traditional Chinese, and English

## Why It May Be Worth a Star

PeekaUsage is not trying to be another LLM frontend or provider aggregator.

It is closer to an **AI usage dashboard widget**:

- It solves a very real pain point for heavy AI-tool users
- It shortens the path from curiosity to answer
- It works especially well if you mix multiple providers
- It is designed to stay quietly useful in the corner of your desktop

If you also have AI quota anxiety, this app will not cure it — but it can at least make that anxiety more efficient.

## Download

Download the latest build from [GitHub Releases](https://github.com/StarChen4/PeekaUsage/releases/latest).

Current release artifacts include:

- Windows: NSIS installer
- Linux: DEB / AppImage
- macOS: `app` / `dmg` for both `x86_64` and `arm64`

### macOS note

- macOS bundles must be built on a Mac
- Apple Developer signing and notarization are not set up yet
- First launch may require manual approval depending on system settings

If macOS says the app is damaged and cannot be opened, run:

```bash
xattr -dr com.apple.quarantine /Applications/PeekaUsage.app
```

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Extra Linux dependencies

If you are developing or packaging on Ubuntu / Debian, install these first:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl file libfuse2 libgtk-3-dev libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### 3. Start the frontend

```bash
npm run dev
```

### 4. Run the desktop app

```bash
npm run tauri dev
```

### 5. Run checks

```bash
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

## Credentials

### API Keys

You can save them in the settings UI or provide them via environment variables.

| Provider | Environment Variable |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Notes:

- Anthropic cost reporting requires an Admin Key
- Environment variables take precedence over saved settings
- The settings page can switch a saved key into the active system environment variable with one click
- On Windows this writes a user-level environment variable; on Linux and macOS it updates the current process and the app-managed shell environment script for new terminals

### OAuth Tokens

Subscription usage is auto-detected from local tool credentials when possible.

> Note: Anthropic subscription endpoints may return HTTP 429 if queried too frequently.

| Source | File Path | Field |
| --- | --- | --- |
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` |

Notes:

- OpenAI `tokens.access_token` supports both string and indexed-object formats
- OpenRouter does not currently expose subscription OAuth usage here

## Supported Platforms

- Windows
- Linux
- macOS

## Project Layout

```text
src/
  components/
  composables/
  stores/
  utils/

src-tauri/src/
  commands/
  config/
  providers/
  tray/
```

## Why Not Every Provider Is Supported Yet

Some providers simply do not expose a stable, official, maintainable usage API. And yes, part of the reason is also ordinary after-work energy limits.

If you use a provider that is still missing, PRs are welcome. The most helpful contributions usually include:

- Rust-side provider implementation and type updates
- Frontend settings and card display support
- Matching docs, environment variables, icons, and verification notes

If the data source is trustworthy, the behavior is clear, and the change does not break the UX, I will be very happy to merge it.

## Roadmap

Good next steps for the project include:

- More providers with official usage APIs
- Better error states and diagnostics
- More widget presentation options
- Smoother first-run onboarding
- Signed and notarized macOS release flow

## Contributing

Issues, PRs, and feature suggestions are all welcome.

If this project helps you, consider giving it a star. At minimum, it tells me I am not the only one being bullied by token limits.

## License

[MIT](./LICENSE)
