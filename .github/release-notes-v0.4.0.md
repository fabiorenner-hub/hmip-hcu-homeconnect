# v0.4.0 — Initial release

First public release of the Homematic IP HCU plugin for BSH **Home Connect** appliances (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa).

## Highlights

- 🔌 **HCU Connect API 1.0.1**: full WebSocket client (`PLUGIN_STATE`, `DISCOVER`, `CONFIG_TEMPLATE`, `CONFIG_UPDATE`, `CONTROL`).
- 🔐 **OAuth2 Device Flow** against Home Connect — only a Client ID needed, refresh tokens are persisted on `/data`.
- 📡 **Live SSE event stream** with auto-reconnect and rate-limit-aware token refresh.
- 🧩 **Device mapping**:
  - Power state → `SWITCH`
  - Ambient/cavity light → `LIGHT`
  - Fridge/freezer setpoint → `CLIMATE_SENSOR`
  - Currently selected program → `SWITCH` (ON = start, OFF = abort)
  - Estimated energy → `ENERGY_METER` with `currentPower` and integrated kWh counter
- ⚙️ **Config page** generated via `CONFIG_TEMPLATE_RESPONSE`, grouped (Auth · Allgemein · Gerätearten · Debug), with toggles for every device class, language, polling, debug dashboard.
- 🖥️ **Debug dashboard** (HTTP + WebSocket) with 7 tabs:
  - Overview · Geräte · API · Events · Energie · Logs · Config
  - Inline setting editor, manual `GET/PUT/POST/DELETE` console with presets, live SVG energy sparklines, filterable log stream, quick-action buttons.
- 🐳 **Multi-arch Dockerfile** for `linux/arm64` (HCU) and `linux/amd64` (dev).
- 🧪 **Smoke + E2E tests** for mapping, config, dashboard endpoints and WebSocket push.

## Download

A source tarball is attached to every release:
[`hmip-hcu-homeconnect-0.4.0.tar.gz`](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/download/v0.4.0/hmip-hcu-homeconnect-0.4.0.tar.gz)

## Installation

```bash
docker buildx build --platform linux/arm64,linux/amd64 \
  -t hmip-hcu-homeconnect:0.4.0 --load .
```

Then push the resulting image to your HCU as described in the [Connect API documentation](https://github.com/homematicip/connect-api).

## Configuration quick start

1. Register a Home Connect developer account, create an application with **Device Flow**, copy the Client ID.
2. Install the plugin on the HCU.
3. Open the plugin configuration page, paste the Client ID, save.
4. Watch the plugin logs (or the debug dashboard) for the verification URL, open it on any device, approve.
5. Your appliances appear in Homematic IP.

## Notes

- The energy meter is a **best-effort estimate** based on a typical-power table per appliance type. Home Connect does not expose live wattage.
- The dashboard binds to all interfaces on the configured port — only expose it on a trusted network.

This project is not affiliated with eQ-3 AG or BSH Hausgeräte GmbH.
