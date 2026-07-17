# Desktop telemetry

Fluxmail Desktop uses anonymous analytics to answer a small set of product and reliability questions. Analytics is enabled by default only in packaged production builds. It runs in the Electron main process, sends through `https://t.fluxmail.ai`, and cannot delay app shutdown for more than the Fluxmail transport's one-second flush budget.

Development, Vitest, and Electron end-to-end runs are disabled unless a test supplies an explicit fake client. Fluxmail does not enable autocapture, session replay, surveys, browser exception capture, or person profiles.

## Events

Every event includes the common properties below.

| Property                 | Value                                          |
| ------------------------ | ---------------------------------------------- |
| `product_surface`        | `mail_app`                                     |
| `client_platform`        | `desktop`                                      |
| `deployment_environment` | `production`                                   |
| `desktop_app_version`    | Packaged desktop app version                   |
| `mcp_version`            | Pinned Fluxmail service version                |
| `electron_version`       | Electron runtime version                       |
| `operating_system`       | Node platform name, such as `darwin`           |
| `architecture`           | Runtime architecture, such as `arm64` or `x64` |

The shared Fluxmail transport also adds `fluxmail_version`, `node_version`, `platform`, and `arch`. It sets `$process_person_profile` to `false` and sends each request with GeoIP disabled.

| Event                          | Event-specific properties                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `desktop app started`          | `cacheState`: `hit` or `miss`; `onboardingComplete`: boolean                                |
| `feature_used`                 | `feature`, `action`, and `source` from fixed desktop allowlists                             |
| `desktop mail operation`       | `operation`, `outcome`, stable `error_code`, rounded `duration_ms`, optional `cache_status` |
| `desktop sync completed`       | `trigger`, `outcome`, rounded `duration_ms`, aggregate `item_count`                         |
| `desktop performance measured` | `metric`, rounded `duration_ms`, `cache_hit`                                                |

The `feature_used` event keeps the existing Fluxmail web vocabulary. The desktop bridge accepts only known feature, action, and source values. It does not accept an event name or a free-form properties object from the renderer.

## Data that must never be sent

Analytics must not include:

- Email addresses, recipients, or account identifiers
- Message, thread, draft, attachment, or provider identifiers
- Subjects, snippets, message bodies, or search text
- Labels, custom folder names, or filenames
- Local paths or URLs
- OAuth tokens, Google client configuration, license keys, or encryption material
- Error messages, stack traces, or provider responses

The desktop analytics wrapper constructs every payload from allowlisted enums, booleans, counts, durations, versions, and stable error codes. Privacy tests add email-like strings, queries, subjects, filenames, paths, URLs, and unknown properties to attempted events and verify that none reaches the client payload.

## Anonymous installation ID

The shared Fluxmail transport creates a random 32-character hexadecimal ID at:

```text
~/.fluxmail/telemetry.id
```

The file is created with mode `0600`. It is local to the Fluxmail data directory, contains no account information, and stays stable so separate Fluxmail clients on the same installation use one anonymous identity.

## Turn analytics off

Open Settings, choose Privacy, and turn off Anonymous analytics. The change writes `~/.fluxmail/telemetry.disabled` and recreates the main-process analytics client immediately.

Administrators and scripts can also set either environment variable before launch:

```sh
FLUXMAIL_TELEMETRY=0
DO_NOT_TRACK=1
```

An environment opt-out takes precedence over the saved preference. When either variable enforces the opt-out, the Settings control is read-only for that run.
