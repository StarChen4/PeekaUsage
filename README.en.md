# How Much Have I Cost

[中文 README](./README.md)

A small desktop widget for keeping an eye on API costs and subscription usage.

This project is built with Tauri v2, Vue 3 + TypeScript on the frontend, and Rust on the backend. It sits quietly in the corner of your desktop and helps you check how much OpenAI, Anthropic, and OpenRouter are costing you.

![App overview](./src/assets/Overview.png)

## What It Does

- Tracks usage-based spending for OpenAI, Anthropic, and OpenRouter
- Shows subscription windows for OpenAI and Anthropic
- Displays rate limits and error states
- Auto-detects OAuth tokens from local Claude Code and Codex CLI files
- Supports tray controls for show, hide, refresh, and settings
- Lets you drag provider cards and keeps the saved order
- Syncs window opacity between the widget and the settings panel

## Platform Notes

- The app is mainly developed and verified on Windows for now
- Interactions are designed to stay consistent across Windows, macOS, and Linux

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the frontend

```bash
npm run dev
```

### 3. Run the desktop app

```bash
npm run tauri dev
```

### 4. Run checks

```bash
npx vue-tsc --noEmit
cargo check
```

If `cargo` is not in your PATH, add your Rust toolchain first.

## Credentials

### API Keys

You can either save them in the settings UI or provide them with environment variables.

| Provider | Environment Variable |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Notes:

- Anthropic cost reporting requires an Admin Key
- Environment variables take precedence over saved settings

### OAuth Tokens

Subscription usage is auto-detected from local tool credentials when possible.

| Source | File Path | Field |
| --- | --- | --- |
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` |

Notes:

- OpenAI `tokens.access_token` supports both string and indexed-object formats
- OpenRouter does not currently provide subscription OAuth usage here

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

## CI

The repository includes a minimal GitHub Actions workflow that runs:

- `npm ci`
- `npx vue-tsc --noEmit`
- `cargo check`

## License

[MIT](./LICENSE)
