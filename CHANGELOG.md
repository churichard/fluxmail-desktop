# Changelog

Fluxmail Desktop records user-facing changes in this file. The format follows [Common Changelog](https://common-changelog.org/).

## [Unreleased](https://github.com/churichard/fluxmail-desktop/compare/v0.3.0...HEAD)

## [0.3.0](https://github.com/churichard/fluxmail-desktop/releases/tag/v0.3.0) - 2026-07-21

_These artifacts use Fluxmail's self-signed certificate and have not been notarized by Apple, so macOS will require approval before opening the app._

### Changed

- Include the original message and citation in replies, restore reply drafts, and attach referenced inline images ([#32](https://github.com/churichard/fluxmail-desktop/pull/32))
- Use an overlay scrollbar in the sidebar to match the thread list and reading pane ([#31](https://github.com/churichard/fluxmail-desktop/pull/31))

### Added

- Search mail with Boolean expressions and filters for people, folders, labels, dates, attachments, files, and accounts, with autocomplete for filters and known values ([#35](https://github.com/churichard/fluxmail-desktop/pull/35))
- Compose replies and forwards in the reading pane, use R, A, and F shortcuts, and confirm before replacing an unsent message ([#30](https://github.com/churichard/fluxmail-desktop/pull/30))

### Fixed

- Start the app when the local Fluxmail data store uses the latest format ([#28](https://github.com/churichard/fluxmail-desktop/pull/28))
- Open a conversation from any non-action area of its thread row ([#33](https://github.com/churichard/fluxmail-desktop/pull/33))

## [0.2.0](https://github.com/churichard/fluxmail-desktop/releases/tag/v0.2.0) - 2026-07-20

_These artifacts use Fluxmail's self-signed certificate and have not been notarized by Apple, so macOS will require approval before opening the app._

### Changed

- Use Fluxmail artwork and center the installer layout ([#19](https://github.com/churichard/fluxmail-desktop/pull/19))
- Keep email headers on the standard arrow cursor ([#21](https://github.com/churichard/fluxmail-desktop/pull/21))

### Added

- Block email tracking pixels before rendering messages and show the blocked domains and reasons ([#22](https://github.com/churichard/fluxmail-desktop/pull/22))
- Relay remote images through Fluxmail for active Pro, Team and Enterprise licenses ([#20](https://github.com/churichard/fluxmail-desktop/pull/20))
- Activate license keys from Desktop Settings and share activated licenses with compatible CLI and MCP apps ([#25](https://github.com/churichard/fluxmail-desktop/pull/25))
- Block remote images by default, with per-message controls and an opt-out preference ([#18](https://github.com/churichard/fluxmail-desktop/pull/18))

### Fixed

- Keep messages readable without caching their bodies when Keychain access is unavailable ([#19](https://github.com/churichard/fluxmail-desktop/pull/19))
- Open DevTools at the bottom and preserve draggable title-bar areas in the empty conversation pane ([#23](https://github.com/churichard/fluxmail-desktop/pull/23))

## [0.1.0](https://github.com/churichard/fluxmail-desktop/releases/tag/v0.1.0) - 2026-07-18

_First release; these artifacts use Fluxmail's self-signed certificate and have not been notarized by Apple, so macOS will require approval before opening the app._

### Added

- Add a macOS Gmail client with inbox navigation, search, threads, compose, drafts, attachments, notifications and mailbox actions ([#1](https://github.com/churichard/fluxmail-desktop/pull/1))
- Encrypt opened messages in the local cache, require approval before loading remote images and provide anonymous telemetry controls ([#1](https://github.com/churichard/fluxmail-desktop/pull/1))
- Load cached mailboxes before refreshing and prevent stale requests from replacing newer views or selections ([#2](https://github.com/churichard/fluxmail-desktop/pull/2), [#7](https://github.com/churichard/fluxmail-desktop/pull/7), [#13](https://github.com/churichard/fluxmail-desktop/pull/13), [#15](https://github.com/churichard/fluxmail-desktop/pull/15))
- Share `~/.fluxmail` data with compatible CLI versions and back up stores before migrations ([#5](https://github.com/churichard/fluxmail-desktop/pull/5))
- Open HTTP, HTTPS and mailto links from rendered messages ([#3](https://github.com/churichard/fluxmail-desktop/pull/3))
- Convert sender colors, backgrounds, gradients and borders for readable messages in dark mode ([#16](https://github.com/churichard/fluxmail-desktop/pull/16))
- Keep mailbox shortcuts working while a message is focused and preserve focus during archive actions ([#4](https://github.com/churichard/fluxmail-desktop/pull/4), [#10](https://github.com/churichard/fluxmail-desktop/pull/10))
- Keep Settings usable at minimum window sizes and simplify the About details ([#11](https://github.com/churichard/fluxmail-desktop/pull/11))
- Streamline the first-run Gmail connection screen ([#12](https://github.com/churichard/fluxmail-desktop/pull/12))
- Bundle Fluxmail 0.5.0, use the built-in Google OAuth client and hide permanent deletion unless an account grants the required scope ([#9](https://github.com/churichard/fluxmail-desktop/pull/9), [#14](https://github.com/churichard/fluxmail-desktop/pull/14), [#17](https://github.com/churichard/fluxmail-desktop/pull/17))
