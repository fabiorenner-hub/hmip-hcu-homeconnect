# Changelog

All notable changes to this project will be documented in this file.

## [0.6.6] - 2026-05-19

### Fixed
- **Setup wizard didn't show "done" after a successful sign-in.** `_updateSetupServer()` stopped the WebSocket server before the final state broadcast had a chance to run. Order is now broadcast → graceful stop after a 5 s delay, so the wizard renders the "You are signed in" screen and reloads itself.
- **Wrong clock displayed in the HCUweb status line.** The container runs in UTC, the displayed time was off by the user's timezone offset (e.g. "21:44" while the user's wall clock said "23:44"). Removed the timestamp from the status — it now reads simply `✓ Mit Home Connect verbunden.` / `✓ Connected to Home Connect.`.
- **`auth.login()` aborts any in-flight device-flow run** before starting a new one. Previously, hitting "Restart login" while the polling loop was still running could leave two loops racing each other.

## [0.6.5] - 2026-05-19

### Fixed
- **Stale verification URL persisted across restarts.** `lastVerificationUrl` and `lastVerificationStatus` were saved to `plugin-state.json`, so after a plugin restart the configuration page would render an expired Home Connect device-flow link and the user would land on `device_verify?user_code=...` for a code that is long gone. Both fields are now treated as ephemeral — never written to disk and never loaded from disk. Existing state files have those fields stripped out on the next save.

### Changed
- Setup wizard link moved to the top of the Login section (order 1). New top-down order while logged out: *Setup wizard → Client ID → Status → Login link → QR code*.

## [0.6.4] - 2026-05-19

### Added
- Setup wizard (port 8124) is back as a clickable `WEBLINK` in the Login section. The link uses the actual container IP detected at startup (e.g. `http://10.88.0.51:8124/`), which is reachable from the LAN in stock HCU container networking. Hidden once logged in. The READONLY URL/status pair from 0.6.2 is gone — it's just one clickable row now.

## [0.6.3] - 2026-05-19

### Fixed
- **Spec-conformance: PluginReadinessStatus.** The plugin was reporting `PLUGIN_NOT_CONFIGURED_YET`, which is not in the enum (Connect API spec §6.6.9 only allows `CONFIG_REQUIRED`, `ERROR`, `READY`). The HCU rejected every state frame with `Cannot deserialize value of type PluginReadinessStatus from String "PLUGIN_NOT_CONFIGURED_YET"` — among other side effects this is why the configuration page would not refresh after a successful sign-in. All five usages now send `CONFIG_REQUIRED` instead.
- **Setup wizard placeholder leaked a real Client ID.** The HTML input in the standalone wizard had a 64-char `placeholder` attribute taken from a previous test session. Replaced with a generic hint ("64 hex characters, uppercase"). My fault, sorry. Anyone who copy-pasted that placeholder by accident: the value was a documented invalid one and never reachable, but please rotate the affected Client ID at developer.home-connect.com to be safe.

### Changed
- **Configuration page de-clutter.** The Login section now shows only what is actionable for the current state:
  - logged out, no client ID: just `Client ID` + `Status`,
  - logged out, login pending: adds the big `Login link` (WEBLINK to api.home-connect.com) + `QR code`,
  - logged in: hides link + QR, shows `Reset login` toggle.
  The `Setup wizard (URL)` and `Setup wizard (status)` rows are removed — the wizard port is generally not reachable from the LAN inside the HCU container, so promoting it on the main page was misleading. Wizard binary stays in place for advanced setups.
- **Success notification.** After a successful sign-in the plugin now sends an `INFO` user message ("Home Connect connected — N devices are now available in Homematic IP") so the Homematic IP app confirms the result even if HCUweb is still showing a stale configuration page. The previous `WARN` "login required" and `ERROR` "login failed" messages are deleted to keep the message list clean.
- Client ID input now has length constraints `64..64` so HCUweb itself rejects too-short pastes.

## [0.6.2] - 2026-05-19

### Added
- HCUweb config page now exposes two READONLY rows in the Login section, while logged out:
  - **Setup wizard (URL)** — `http://<DEINE-HCU-IP>:8124/` for copy-paste. Plugin doesn't try to autodetect the LAN IP anymore (the container's IP is unreachable from the LAN inside the HCU sandbox), so the user replaces the placeholder with the IP they use to reach HCUweb.
  - **Setup wizard (status)** — `✓ Running internally on port 8124` or `✗ Not started`. Reflects whether the wizard server is up inside the container; it does not prove LAN reachability.
- Both rows hide once the user is signed in.

## [0.6.1] - 2026-05-19

### Fixed
- The setup wizard URL exposed in HCUweb pointed at the container's internal IP (`10.88.0.x`), which is unreachable from the LAN on a stock HCU. The login link in the HCUweb config page now points directly at `api.home-connect.com/security/oauth/device_verify?...` — that URL is public, so it works from any browser, including phones.
- The `WEBLINK` "Open setup wizard" property was replaced by the original `WEBLINK` + `QRCODE` pair pointing at the Home Connect verification URL.
- README (DE + EN): Step 3 ("Sign in") rewritten to say "open the link in any browser", with a separate *Advanced* note that the wizard on port 8124 is generally unreachable from the LAN inside the HCU container sandbox.

### Kept
- The setup wizard server itself stays in place for advanced setups where the container port has been forwarded to the LAN; it just isn't the default path anymore.

## [0.6.0] - 2026-05-19

### Added
- **Setup wizard** at `http://<HCU-IP>:8124/`. A self-contained, bilingual (DE/EN) Single-Page-App that walks the user through:
  1. Getting a Client ID from the Home Connect developer portal — with a callout that *Device Flow* is mandatory.
  2. Pasting the Client ID with live 64-char validation.
  3. Signing in via a clickable link **and** a server-rendered QR code, with live state updates over WebSocket.
- The wizard runs **only while the user is not authenticated**. Once a valid access token is stored, the wizard server stops and its URL becomes unreachable.
- The HCUweb plugin configuration page now exposes a `WEBLINK` "Open setup wizard" pointing at the wizard URL while the user is logged out — replacing the inline `WEBLINK` + `QRCODE` properties.
- New dependency: `qrcode@1.5.4` for server-side QR rendering.
- Setup wizard render test (`tests/setup-render.js`) added to the npm test suite.

### Changed
- `Dockerfile` exposes port 8124 in addition to 8123.
- `_handleConfigUpdate` simplified — it no longer waits up to 8 s for a verification URL before answering, since the wizard handles the user interaction.
- README (DE + EN) rewritten with concrete step-by-step screenshots-quality instructions for getting a Client ID, including a table that lists every form field in the developer portal with the value and the "must be Device Flow" warning.

## [0.5.7] - 2026-05-19

### Changed
- UX overhaul of the plugin configuration page (HCUweb):
  - Configuration page is now fully bilingual (DE/EN) and follows the `languageCode` from the HCU's `CONFIG_TEMPLATE_REQUEST`. English locales fall back gracefully.
  - Sections renamed and reordered to *Login → Devices → Advanced* (was: *Auth, Allgemein, Gerätearten, Debug*). Most users only need to touch the *Login* section.
  - Status line uses a single READONLY entry with a `✓` symbol and a one-line summary, instead of dense technical English.
  - Setting names and descriptions rewritten to be self-explanatory ("On/off switch" instead of "Power als SWITCH", "Cooling temperature" instead of "Kühltemperatur als CLIMATE_SENSOR", etc.).
  - "Reset login" replaced "Login zurücksetzen / resetSession" with a clearer label and description.
- README.md and README.de.md rewritten end-to-end with a 3-step setup (Get a Client ID → Install plugin → Sign in), a configuration reference table, a troubleshooting matrix that maps the most common Home Connect OAuth errors to fixes, and a clearer build / contribute section.
- Plugin description in the HCU plugin tile rewritten to a one-line value pitch: "Three-step setup: paste a Client ID, click the login link, you're done."

### Added
- `INCLUSION_EVENT` from the HCU is now logged as informational ("HCU confirms inclusion of N device(s)") instead of falling through the "Unhandled HCU message type" path.
- `EXCLUSION_EVENT` removes the affected devices from the local cache so the plugin stops emitting `STATUS_EVENT`s for them.

## [0.5.6] - 2026-05-19

### Fixed
- HCU was rejecting every plugin message: the WebSocket envelope was built with `{ pluginId, id, ...envelope }` so a missing `id` on the envelope object would overwrite the UUID fallback with `undefined`. The `id` is now applied after the spread, matching the Connect API requirement that every plugin message carries a `PluginMessage.id`.
- `CONFIG_UPDATE_RESPONSE.message` was sent as `{ en, de }` but the Connect API spec (§6.3.2) defines it as a plain `String`. The HCU rejected every config save with `Cannot deserialize value of type java.lang.String from Object value`. The plugin now picks the right localized string based on the `languageCode` in the incoming `CONFIG_UPDATE_REQUEST` (only the response message; `CREATE_USER_MESSAGE_REQUEST.title`/`message` remain `Map<String,String>` per spec §6.3.4).
- `eventsource@2.x` exposes the constructor as the CommonJS default, so `const { EventSource } = require('eventsource')` returned `undefined` and the device-flow login crashed with `EventSource is not a constructor` right after the access token was minted. Fixed the import and switched to the v2 `headers` constructor option for the `Authorization: Bearer …` header.
- A failure in the SSE event stream setup no longer rolls back a successful Home Connect login. The login + device discovery branch is now isolated from `events.start()` so the plugin reports `READY` and falls back to polling-only when SSE is unavailable.

## [0.5.5] - 2026-05-19

### Changed
- Plugin configuration page (HCUweb) now drives the Home Connect login interactively. After the Client ID is saved the page shows:
  - a `READONLY` status line ("waiting for browser approval", "logged in", "last error: ..."),
  - a `WEBLINK` "Anmeldelink" with the verification URL (clickable in HCUweb),
  - a `QRCODE` to scan the verification URL with a phone.
  These properties only appear while the device flow is actually waiting; they disappear automatically once the login succeeds.
- `_handleConfigUpdate` no longer sends two `CONFIG_UPDATE_RESPONSE` envelopes for the same request id (this was triggering an `ERROR_RESPONSE` from the HCU after every Client ID change). The response is delayed up to 8 s so the verification URL can be inlined into the HCUweb confirmation message.
- HCU `ERROR_RESPONSE` envelopes are now logged with their full body (used to fall through the "Unhandled HCU message type" path silently).

### Fixed
- Login state survives restarts: the last verification URL and login status are persisted to `data/plugin-state.json` so the configuration page can show the correct state after a plugin reload.

## [0.5.4] - 2026-05-19

### Changed
- Home Connect auth: detailed step-by-step logging of the OAuth device flow. Every HTTP call is logged with URL, body fields (with secrets masked), HTTP status, response time, response headers (`x-request-id`, `x-correlation-id`, `retry-after` ...), full OAuth error payload (`error` + `error_description`) and per-poll status (`authorization_pending`, `slow_down` ...). The Client ID is validated locally (length 64, alphanumeric) before any request is sent. Operators can now diagnose `400 unauthorized_client`, `invalid_scope` or test-account misconfiguration directly from the plugin logs.

## [0.5.3] - 2026-05-19

### Fixed
- Config updates from the HCU were silently dropped: the plugin parsed `CONFIG_UPDATE_REQUEST.body.properties` as a map of template objects (`{ currentValue: ... }`) instead of the spec-defined flat key→value map. As a result, entering the Home Connect Client ID had no effect (readiness stayed at `PLUGIN_NOT_CONFIGURED_YET`), and the five `enableX` toggles flipped to `false` because `Boolean(undefined)` was applied. `applyConfigUpdate` now follows the Connect API spec and tolerates both shapes, and ignores undefined values to keep partial updates safe. Smoke test extended to cover the spec shape and partial updates.

### Changed
- Build pipeline: `npm run package` now builds the HCU plugin image tarball via `docker buildx --platform linux/arm64` + `docker save` (the format HCUweb actually accepts). The previous source-only archive moved to `npm run package:source` and is renamed to `hmip-hcu-homeconnect-<version>-source.tar.gz` so it can no longer be confused with the installable image tarball. `build.ps1` / `build.sh` read the version from `package.json` and write to `dist/`, then mirror the latest tarball into the repo root.

## [0.5.0] - 2026-05-19

### Changed
- Plugin metadata: issuer set to Fabio Renner, GitHub URL and PayPal donation link appended to description rendered in the HCU plugin tile.
- README.md / README.de.md: plugin icon at the top, GitHub link, PayPal donate form, updated download link.
- New plugin icon (icon.svg).

## [0.4.0] - 2026-05-19

Initial public release.

### Added
- HCU plugin core: WebSocket client for the Homematic IP Connect API 1.0.1, handling `PLUGIN_STATE`, `DISCOVER`, `CONFIG_TEMPLATE`, `CONFIG_UPDATE` and `CONTROL` flows.
- Home Connect integration: OAuth2 device authorization flow, REST client with built-in rate limiting (49/min, 999/day, honors `429 Retry-After`), live SSE event stream subscription with auto-reconnect.
- Device mapping: appliance power as `SWITCH`, ambient lights as `LIGHT`, fridge/freezer setpoint temperature as `CLIMATE_SENSOR`.
- Program control: per-appliance `SWITCH` that starts the currently selected program (`ON`) or aborts it (`OFF`), live status mirrored from `OperationState`.
- Estimated energy meter: per-appliance `ENERGY_METER` with typical-power table per appliance type, kWh accumulator integrated every 30 s and persisted across restarts.
- Persistent state file (`data/plugin-state.json`) keeping OAuth refresh tokens, discovered appliances and energy counters.
- Configuration page rendered via `CONFIG_TEMPLATE_RESPONSE` with grouped properties (Auth, Allgemein, Gerätearten, Debug).
- Comprehensive HTML/WebSocket debug dashboard with 7 tabs (Overview, Geräte, API, Events, Energie, Logs, Config), live push, inline setting edits, manual API console, energy SVG sparklines, log filter and quick actions.
- Multi-arch Dockerfile (`linux/arm64` + `linux/amd64`) on top of `ghcr.io/homematicip/alpine-node-simple`.
- Smoke tests and dashboard E2E tests, run via `npm test`.

