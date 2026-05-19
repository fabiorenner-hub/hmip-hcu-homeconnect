# Changelog

All notable changes to this project will be documented in this file.

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

