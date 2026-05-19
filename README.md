# Homematic IP HCU Plugin: Home Connect

A Node.js plugin for the Homematic IP Home Control Unit (HCU) that integrates BSH **Home Connect** household appliances (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa) into the Homematic IP system.

The plugin connects to the official Home Connect Cloud API using the OAuth2 **Device Authorization Flow** and exposes appliances as HCU plugin devices, so they can be controlled, monitored and used in automations alongside native Homematic IP devices.

> Inspired by the excellent ioBroker.homeconnect adapter and built against the [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api).

## Features

- **OAuth2 Device Flow** login (no user/password stored, only a Client ID).
- Live event stream via Server-Sent Events (`/api/homeappliances/events`).
- Automatic device discovery and feature mapping to HCU device archetypes.
- Switch on/off, monitor connection state, door, operation state, remaining time, power consumption (where available).
- **Programmsteuerung**: pro Gerät ein zusätzlicher `SWITCH` — `ON` startet das aktuell auf dem Gerät gewählte Programm, `OFF` bricht es ab.
- **Energiezähler (geschätzt)**: pro Gerät ein `ENERGY_METER` mit `currentPower` und kumuliertem `energyCounter` in kWh. Da Home Connect keine Live-Leistungsdaten liefert, wird ein typischer Verbrauchswert pro Gerätetyp angesetzt, solange `OperationState = Run`. Der kWh-Zähler wird im persistenten State integriert und überlebt Neustarts. Tabelle in `src/mapping.js#TYPICAL_POWER_W` anpassbar.
- Extensive **Config Page** rendered by the HCU via `CONFIG_TEMPLATE_RESPONSE` (Client ID, language, polling intervals, debug toggle, device-type filter, ...).
- Optional **HTML Debug Dashboard** with live logs, device inventory, last API calls, rate-limit counters and token state.
- Built-in client-side rate limiting that honors the Home Connect quotas (50 req/min, ~1000 req/day, token refresh limits).
- Auto-refresh of the access token, transparent re-login when refresh tokens expire.
- User messages forwarded to the Homematic IP smartphone app on errors that need attention (e.g. login required).

## Quick start

1. Register a free developer account at [developer.home-connect.com](https://developer.home-connect.com) and create an application using **Device Flow** as the OAuth flow. Copy the resulting `Client ID`.
2. Build the plugin container (see *Building*) and install it on your HCU.
3. Open the plugin configuration on the HCU, enter your Client ID, save.
4. Watch the plugin logs for the verification URL, open it in your browser and approve.
5. Your Home Connect appliances appear as HCU devices.

## Building

The image follows the HCU plugin container conventions (alpine-node base, `LABEL de.eq3.hmip.plugin.metadata=...`).

For a local build matching your machine's architecture:

```bash
npm install
docker build -t hmip-plugin-homeconnect .
```

For a multi-arch build that runs on the HCU (ARM64) and on x86_64 dev machines:

```bash
docker buildx build --platform linux/arm64,linux/amd64 \
  -t hmip-plugin-homeconnect:0.2.0 --load .
```

Push the resulting image to your HCU as described in the official Connect API documentation.

## Configuration

All settings are exposed through the HCU's plugin configuration page. The plugin sends a `CONFIG_TEMPLATE_RESPONSE` describing the available properties.

| Property            | Type    | Default     | Description                                                                 |
|---------------------|---------|-------------|-----------------------------------------------------------------------------|
| `clientId`          | string  | (required)  | Home Connect Application Client ID                                          |
| `language`          | enum    | `de-DE`     | Language for API responses (`de-DE`, `en-GB`, `en-US`, `fr-FR`, ...)         |
| `pollIntervalSec`   | int     | `0`         | Optional polling interval in seconds (0 = use event stream only)            |
| `debugDashboard`    | boolean | `false`     | Enable the local HTML debug dashboard                                        |
| `debugDashboardPort`| int     | `8123`      | TCP port the debug dashboard listens on                                      |
| `enableLight`       | boolean | `true`      | Expose appliance ambient lights as HCU `LIGHT` devices                       |
| `enableSwitch`      | boolean | `true`      | Expose appliance power state as HCU `SWITCH` devices                         |
| `enableClimate`     | boolean | `true`      | Expose fridge/freezer temperature as HCU `CLIMATE_SENSOR` devices            |
| `enablePrograms`    | boolean | `true`      | Expose a `SWITCH` per appliance to start/stop the currently selected program |
| `enableEnergy`      | boolean | `true`      | Expose an `ENERGY_METER` per appliance with estimated power and accumulated kWh |
| `resetSession`      | boolean | `false`     | One-shot: drop stored token and start a new device flow                     |
| `verboseLogging`    | boolean | `false`     | Log every WebSocket and Home Connect message                                |

## Debug Dashboard

When `debugDashboard` is enabled, point your browser at `http://<hcu-or-host>:<debugDashboardPort>/` (default `8123`).

The dashboard pushes live updates over a WebSocket (`/ws`) and offers seven tabs:

- **Overview** — Plugin readiness, HCU/HC connection pills, OAuth session info, rate-limit progress bars, quick actions (Token erneuern, Appliances neu laden, Eventstream neu starten, Test-Nachricht an HCU App, Login zurücksetzen, State.json downloaden), Verification URL display when login is pending.
- **Geräte** — All mapped HCU devices and the original Home Connect appliances. Per appliance: live status, settings (inline editable, `PUT` per row), available programs, plus action buttons: Programm starten/abbrechen, Power On/Off, Tür öffnen, kWh-Zähler reset.
- **API** — Manual `GET/PUT/POST/DELETE` against the Home Connect API with quick-pick presets (Liste Geräte, Status, Verfügbare Programme, Tür öffnen). Live history of the last 100 calls with status code, duration and inline error description.
- **Events** — Live ring buffer of the last 200 HCU WebSocket frames (in/out) and the last 200 Home Connect SSE events. Click a row for the full JSON.
- **Energie** — One mini SVG chart per `ENERGY_METER` device showing watts (blue) and kWh (green) over time.
- **Logs** — Live log stream with level filter, full-text filter, auto-scroll toggle and clear button.
- **Config** — Read-only view of the current persisted config.

The dashboard is bound to all interfaces of the container; consider exposing the port only on a trusted network.

## Architecture

```
                         +-------------------+
                         |   Home Connect    |
                         |   Cloud API       |
                         +---------+---------+
                                   ^
                                   | HTTPS / SSE
                                   |
+-----------+   WebSocket   +------+--------+   HTTP    +---------------------+
|    HCU    +<------------->+   Plugin      +---------->+ Debug Dashboard UI  |
|  (9001)   |  (Connect API)|  (Node.js)    |           |  (optional)         |
+-----------+                +---------------+           +---------------------+
```

Key modules in `src/`:

- `index.js` — entrypoint, parses CLI args (`pluginId`, `host`, `tokenFile`), wires everything together.
- `hcuClient.js` — WebSocket client that speaks the HCU Connect API (PluginMessage envelopes, request/response handling).
- `homeconnect/api.js` — REST client with built-in rate limiting and token refresh.
- `homeconnect/auth.js` — OAuth2 device authorization flow.
- `homeconnect/events.js` — SSE event stream subscriber.
- `mapping.js` — Maps Home Connect appliance types to HCU `DeviceType` and `Feature` arrays.
- `config.js` — Builds the `CONFIG_TEMPLATE_RESPONSE` and persists user values.
- `state.js` — In-memory state, persisted to `data/plugin-state.json`.
- `dashboard.js` — Optional HTML debug dashboard (no external deps, pure HTTP).
- `logger.js` — Lightweight ring-buffered logger consumed by the dashboard.

## License

Apache-2.0. Home Connect is a trademark of BSH Hausgeräte GmbH; Homematic IP is a trademark of eQ-3 AG. This project is not affiliated with either company.
