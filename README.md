# Fluxmail Desktop

Fluxmail Desktop is a fast, local-first Gmail client for macOS. It uses Electron and calls the pinned Fluxmail mail service directly in the main process. There is no local REST server, MCP transport, or hosted web API between the interface and Gmail.

The first release focuses on the work people do every day: a unified inbox, account and folder navigation, search, conversations, attachments, bulk actions, drafts, compose, reply, reply all, and forward. It supports multiple Gmail accounts and keeps the normal macOS app process running for sync and notifications after its last window closes.

## Requirements

- macOS 13 or newer
- Node.js 22.22 or newer
- pnpm 11.9.0
- A Google OAuth desktop client for live Gmail use

## Set up the repository

Clone with submodules, then install and build the pinned Fluxmail packages:

```sh
git clone --recurse-submodules git@github.com:churichard/fluxmail-desktop.git
cd fluxmail-desktop
pnpm install
pnpm build:mcp
```

If the repository is already cloned, run `git submodule update --init --recursive` before installing.

For a live Gmail build, copy `.env.example` to `.env` and provide `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID` and `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET`. Vite injects these values into the Electron main bundle only. They are not available to the renderer.

Start the app with:

```sh
pnpm dev
```

Fluxmail uses `~/.fluxmail` for shared accounts, encrypted credentials, licensing, configuration, analytics preference, and the anonymous installation ID. Desktop message metadata lives in the app's macOS Application Support directory. Opened message bodies are encrypted with Electron `safeStorage` before they enter the desktop cache.

## Useful commands

- `pnpm typecheck` checks the desktop TypeScript project.
- `pnpm lint` runs Oxlint.
- `pnpm format:check` checks formatting.
- `pnpm test` runs unit and privacy tests under Electron's Node runtime.
- `pnpm build` creates an unsigned app bundle for the current architecture.
- `pnpm make` creates the configured DMG and ZIP release files.

## Keyboard shortcuts

- `C` compose
- `Command K` or `/` focus search
- `J` and `K` move through conversations
- `R` reply
- `E` archive
- `#` move to Trash
- `S` star or unstar
- `U` toggle read or unread
- `Command R` refresh
- `Command Enter` send from the compose window

## Security model

The renderer is context isolated, sandboxed, and has no Node access. Its only privileged surface is the typed `window.fluxmail` bridge. Both sides of every IPC call validate requests and responses, and the main process rejects calls from unknown frames.

Email HTML is sanitized and rendered inside a scriptless sandboxed iframe with its own restrictive content security policy. Forms, scripts, nested frames, unsafe links, and small tracking pixels are removed. Remote images are off by default. CID images are resolved through the main process, and approved HTTPS or email links open in the system browser.

## Analytics

Packaged production builds send anonymous product, reliability, and performance events through the first-party Fluxmail PostHog endpoint. Development and test builds do not send analytics. The renderer never receives a PostHog client.

See [Desktop telemetry](docs/telemetry.md) for the event schema, prohibited data, installation ID details, and opt-out controls.

## Release configuration

Release builds need a Developer ID Application certificate in the active keychain and an App Store Connect API key for notarization. GitHub Actions expects these secrets:

- `MACOS_CERTIFICATE_P12_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_KEY_P8_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID`
- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET`

The release workflow builds separate Apple Silicon and Intel DMGs, signs each app with hardened runtime, notarizes it, and attaches both artifacts to the matching GitHub Release.
