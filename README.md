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

Fluxmail uses the OAuth app bundled with the pinned Fluxmail package by default. To use a different Google OAuth desktop client, copy `.env.example` to `.env` and set `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID` and `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET`. Vite injects these overrides into the Electron main bundle only. They are not available to the renderer. The bundled client uses `gmail.modify`, while a custom client requests full Gmail access. Fluxmail shows permanent deletion only after Google grants that scope. Reconnect accounts that were added before the custom client was configured.

The hosted image relay accepts only the Google OAuth client IDs configured on `fluxmail.ai`. If the service accepts your custom client, set `FLUXMAIL_DESKTOP_IMAGE_RELAY_GOOGLE_CLIENT_IDS` to the same comma-separated list used by `IMAGE_PROXY_DESKTOP_GOOGLE_CLIENT_IDS` in `fluxmail-web`. Fluxmail keeps the relay unavailable for accounts whose OAuth client is not on that list.

Start the app with:

```sh
pnpm dev
```

Fluxmail uses `~/.fluxmail` for accounts, encrypted credentials, licensing, configuration, the analytics preference, and the anonymous installation ID. A separately installed `fluxmail` npm CLI uses the same directory by default, so it sees the same accounts and settings. Desktop and CLI versions may differ when both support the stored data format. An incompatible version stops before changing the shared data and asks the user to update it.

`FLUXMAIL_DATA_DIR` changes the whole shared data directory, while `FLUXMAIL_DB_PATH` changes only the SQLite database path. Shell variables and `.env.local` or `.env` files in the CLI working directory take priority over settings saved in `~/.fluxmail/config.env`. These overrides can intentionally give the CLI a separate installation.

Desktop message metadata and interface preferences live in the app's macOS Application Support directory. Opened message bodies are encrypted with Electron `safeStorage` before they enter the desktop cache.

## Useful commands

- `pnpm typecheck` checks the desktop TypeScript project.
- `pnpm lint` runs Oxlint.
- `pnpm format:check` checks formatting.
- `pnpm test` runs unit and privacy tests under Electron's Node runtime.
- `pnpm build` creates an ad hoc-signed app bundle for the current architecture.
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

Email HTML is sanitized and rendered inside a scriptless sandboxed iframe with its own restrictive content security policy. Forms, scripts, nested frames, unsafe links, and tracking pixels from common email services are removed automatically. Remote images are off by default. CID images are resolved through the main process, and approved HTTPS or email links open in the system browser.

## Analytics

Packaged production builds send anonymous product, reliability, and performance events through the first-party Fluxmail PostHog endpoint. Development and test builds do not send analytics. The renderer never receives a PostHog client.

See [Desktop telemetry](docs/telemetry.md) for the event schema, prohibited data, installation ID details, and opt-out controls.

## Release configuration

Releases use the OAuth app bundled with the Fluxmail package. These GitHub secrets can override it:

- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID`
- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET`
- `FLUXMAIL_DESKTOP_IMAGE_RELAY_GOOGLE_CLIENT_IDS`

Set the Google client ID and client secret together, or leave both unset. Set the relay client ID list only when the same audiences are configured in `fluxmail-web`.

Code signing is optional. A persistent self-signed identity requires these three GitHub secrets:

- `MACOS_CERTIFICATE_P12_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`

The workflow uses the same certificate for every release, which gives the app a stable designated requirement for macOS Keychain access. Keep an encrypted backup of the P12 and its password outside GitHub. A self-signed certificate does not make the app trusted by Gatekeeper and cannot be notarized.

Developer ID signing and notarization also require these three secrets:

- `APPLE_API_KEY_P8_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Leave all Apple secrets unset to build with ad hoc signatures. Set only the signing group for persistent self-signed releases. Set both complete groups for Developer ID signing, hardened runtime, and notarization. The workflow rejects partial groups. macOS requires users to approve both ad hoc and self-signed apps before opening them.

The workflow attaches both architectures to the GitHub Release that matches the pushed tag. Unnotarized releases include a warning in their release notes.
