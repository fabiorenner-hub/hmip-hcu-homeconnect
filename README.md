# Homematic IP HCU Plugin · Home Connect

[Deutsch](#deutsch) · [English](#english)

Ein Node.js-Plugin für die Homematic IP Home Control Unit (HCU), das BSH **Home Connect** Geräte (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa) ins Homematic IP System integriert.

A Node.js plugin for the Homematic IP Home Control Unit (HCU) that integrates BSH **Home Connect** household appliances (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa) into the Homematic IP system.

> Inspiriert vom ioBroker.homeconnect Adapter, gebaut gegen die [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api).
> Inspired by the ioBroker.homeconnect adapter, built against the [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api).

---

## Deutsch

### Funktionen

- **OAuth2 Device Flow** Login (kein Passwort gespeichert, nur eine Client ID).
- Live Event Stream über Server-Sent Events (`/api/homeappliances/events`).
- Automatische Geräteerkennung und Feature-Mapping auf HCU-Gerätearten.
- Ein/Aus schalten, Verbindungsstatus, Tür, Operation State, Restzeit, Stromverbrauch (wenn verfügbar).
- **Programmsteuerung**: pro Gerät ein zusätzlicher `SWITCH` — `ON` startet das aktuell auf dem Gerät gewählte Programm, `OFF` bricht es ab.
- **Energiezähler (geschätzt)**: pro Gerät ein `ENERGY_METER` mit `currentPower` und kumuliertem `energyCounter` in kWh. Da Home Connect keine Live-Leistungsdaten liefert, wird ein typischer Verbrauchswert pro Gerätetyp angesetzt, solange `OperationState = Run`. Der kWh-Zähler wird im persistenten State integriert und überlebt Neustarts. Tabelle in `src/mapping.js#TYPICAL_POWER_W` anpassbar.
- Umfangreiche **Konfigurationsseite**, vom HCU über `CONFIG_TEMPLATE_RESPONSE` gerendert (Client ID, Sprache, Polling-Intervall, Debug-Toggle, Gerätearten-Filter, ...).
- Optionales **HTML Debug Dashboard** mit Live-Logs, Gerätelisten, letzten API Calls, Rate-Limit-Statistiken und Token-Status.
- Eingebautes Rate-Limiting, das die Home Connect Quotas respektiert (50 Req/Min, ~1000 Req/Tag, Token-Refresh-Limits).
- Auto-Refresh des Access-Tokens, transparenter Re-Login bei abgelaufenem Refresh-Token.
- User-Messages werden bei Fehlern an die Homematic IP Smartphone-App weitergeleitet (z. B. Login erforderlich).

### Schnellstart

1. Erstelle einen kostenlosen Developer-Account unter [developer.home-connect.com](https://developer.home-connect.com) und lege eine Application mit **Device Flow** als OAuth-Flow an. Kopiere die `Client ID`.
2. Plugin-Container bauen (siehe *Build*) und auf der HCU installieren.
3. Plugin-Konfiguration auf der HCU öffnen, Client ID eintragen, speichern.
4. In den Plugin-Logs die Verifizierungs-URL abgreifen, im Browser öffnen und bestätigen.
5. Deine Home Connect Geräte erscheinen als HCU-Geräte.

### Build

Das Image folgt den HCU-Plugin-Container-Konventionen (alpine-node Base, `LABEL de.eq3.hmip.plugin.metadata=...`).

Lokaler Build für die Architektur deines Rechners:

```bash
npm install
docker build -t hmip-hcu-homeconnect .
```

Multi-Arch-Build für HCU (ARM64) und x86_64-Dev-Maschinen:

```bash
docker buildx build --platform linux/arm64,linux/amd64 \
  -t hmip-hcu-homeconnect:0.4.0 --load .
```

Das Image wie in der offiziellen Connect-API-Doku auf die HCU pushen.

### Source-Tarball

`npm run package` erzeugt `dist/hmip-hcu-homeconnect-<version>.tar.gz` mit dem kompletten Source. Die GitHub-Action `.github/workflows/release.yml` baut das Tarball automatisch bei jedem `v*`-Tag und hängt es ans GitHub-Release. Aktuelles Asset: [Release-Seite](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest).

### Konfiguration

Alle Einstellungen werden auf der Plugin-Konfigurationsseite des HCU angezeigt. Das Plugin sendet ein `CONFIG_TEMPLATE_RESPONSE` mit allen verfügbaren Properties.

| Property             | Typ     | Default     | Beschreibung                                                                            |
|----------------------|---------|-------------|-----------------------------------------------------------------------------------------|
| `clientId`           | string  | (Pflicht)   | Home Connect Application Client ID                                                       |
| `language`           | enum    | `de-DE`     | Sprache der API-Antworten (`de-DE`, `en-GB`, `en-US`, `fr-FR`, ...)                       |
| `pollIntervalSec`    | int     | `0`         | Optionales Polling in Sekunden (0 = nur Event-Stream)                                    |
| `debugDashboard`     | boolean | `false`     | HTML Debug Dashboard aktivieren                                                          |
| `debugDashboardPort` | int     | `8123`      | TCP-Port des Debug-Dashboards                                                            |
| `enableLight`        | boolean | `true`      | Innenlichter als HCU `LIGHT` exportieren                                                  |
| `enableSwitch`       | boolean | `true`      | Power-State als HCU `SWITCH` exportieren                                                  |
| `enableClimate`      | boolean | `true`      | Kühl-/Gefriertemperatur als HCU `CLIMATE_SENSOR` exportieren                              |
| `enablePrograms`     | boolean | `true`      | Pro Gerät ein `SWITCH` zum Starten/Stoppen des aktuell gewählten Programms                |
| `enableEnergy`       | boolean | `true`      | Pro Gerät ein `ENERGY_METER` mit geschätzter Leistung und integrierter kWh                |
| `resetSession`       | boolean | `false`     | Einmalig: gespeicherten Token löschen, neuen Device-Flow starten                          |
| `verboseLogging`     | boolean | `false`     | Loggt jeden WebSocket- und Home-Connect-Frame                                            |

### Debug Dashboard

Wenn `debugDashboard` aktiv ist, im Browser `http://<hcu-or-host>:<debugDashboardPort>/` öffnen (Default `8123`).

Das Dashboard pusht Live-Updates über WebSocket (`/ws`) und bietet sieben Tabs:

- **Overview** — Plugin-Readiness, HCU-/HC-Verbindungsstatus, OAuth-Session-Info, Rate-Limit-Bars, Quick Actions (Token erneuern, Appliances neu laden, Eventstream neu starten, Test-Nachricht an HCU App, Login zurücksetzen, State.json Download), Verifizierungs-URL bei ausstehendem Login.
- **Geräte** — Alle gemappten HCU-Geräte und die Original-Home-Connect-Appliances. Pro Appliance: Live-Status, inline editierbare Settings (`PUT` pro Zeile), verfügbare Programme, Aktions-Buttons: Programm starten/abbrechen, Power On/Off, Tür öffnen, kWh-Zähler reset.
- **API** — Manuelle `GET/PUT/POST/DELETE` gegen die Home Connect API mit Quick-Pick-Presets (Liste Geräte, Status, Verfügbare Programme, Tür öffnen). Live-Historie der letzten 100 Calls mit Statuscode, Dauer und Inline-Fehler-Beschreibung.
- **Events** — Live-Ringbuffer der letzten 200 HCU-WebSocket-Frames (in/out) und der letzten 200 Home-Connect-SSE-Events. Klick auf eine Zeile → komplettes JSON.
- **Energie** — Ein Mini-SVG-Chart pro `ENERGY_METER` mit Watt (blau) und kWh (grün) über die Zeit.
- **Logs** — Live-Log-Stream mit Level- und Volltextfilter, Auto-Scroll-Toggle, Clear-Button.
- **Config** — Read-only-Anzeige der aktuell gespeicherten Konfiguration.

Das Dashboard bindet an alle Interfaces des Containers — den Port nur in einem vertrauenswürdigen Netz freigeben.

### Architektur

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

Wichtige Module unter `src/`:

- `index.js` — Einstiegspunkt, parst CLI-Args (`pluginId`, `host`, `tokenFile`), verdrahtet alles.
- `hcuClient.js` — WebSocket-Client für die HCU Connect API (PluginMessage-Envelopes, Request/Response-Handling).
- `homeconnect/api.js` — REST-Client mit Rate-Limiting und Token-Refresh.
- `homeconnect/auth.js` — OAuth2 Device Authorization Flow.
- `homeconnect/events.js` — SSE Event Stream Subscriber.
- `mapping.js` — Mappt Home-Connect-Gerätetypen auf HCU `DeviceType` und `Feature`-Arrays.
- `config.js` — Baut die `CONFIG_TEMPLATE_RESPONSE` und persistiert User-Werte.
- `state.js` — In-Memory-State, persistiert auf `data/plugin-state.json`.
- `dashboard.js` — Optionales HTML Debug Dashboard (keine externen Deps, nur HTTP + WebSocket).
- `logger.js` — Schlanker Ring-Buffer-Logger fürs Dashboard.

### Lizenz

Apache-2.0. Home Connect ist eine Marke der BSH Hausgeräte GmbH; Homematic IP ist eine Marke der eQ-3 AG. Dieses Projekt ist mit keinem der beiden Unternehmen verbunden.

---

## English

### Features

- **OAuth2 Device Flow** login (no user/password stored, only a Client ID).
- Live event stream via Server-Sent Events (`/api/homeappliances/events`).
- Automatic device discovery and feature mapping to HCU device archetypes.
- Switch on/off, monitor connection state, door, operation state, remaining time, power consumption (where available).
- **Program control**: per appliance one extra `SWITCH` — `ON` starts the currently selected program, `OFF` aborts it.
- **Estimated energy meter**: per appliance one `ENERGY_METER` with `currentPower` and accumulated `energyCounter` in kWh. Since Home Connect does not expose live wattage, a typical-power table per appliance type is used while `OperationState = Run`. The kWh counter is integrated locally and persisted across restarts. Customize via `src/mapping.js#TYPICAL_POWER_W`.
- Extensive **config page** rendered by the HCU via `CONFIG_TEMPLATE_RESPONSE` (Client ID, language, polling interval, debug toggle, device-type filter, ...).
- Optional **HTML debug dashboard** with live logs, device inventory, last API calls, rate-limit counters and token state.
- Built-in client-side rate limiting that honors the Home Connect quotas (50 req/min, ~1000 req/day, token refresh limits).
- Auto-refresh of the access token, transparent re-login when refresh tokens expire.
- User messages forwarded to the Homematic IP smartphone app on errors that need attention (e.g. login required).

### Quick start

1. Register a free developer account at [developer.home-connect.com](https://developer.home-connect.com) and create an application using **Device Flow** as the OAuth flow. Copy the `Client ID`.
2. Build the plugin container (see *Building*) and install it on your HCU.
3. Open the plugin configuration on the HCU, enter your Client ID, save.
4. Watch the plugin logs for the verification URL, open it in your browser and approve.
5. Your Home Connect appliances appear as HCU devices.

### Building

The image follows the HCU plugin container conventions (alpine-node base, `LABEL de.eq3.hmip.plugin.metadata=...`).

For a local build matching your machine's architecture:

```bash
npm install
docker build -t hmip-hcu-homeconnect .
```

For a multi-arch build that runs on the HCU (ARM64) and on x86_64 dev machines:

```bash
docker buildx build --platform linux/arm64,linux/amd64 \
  -t hmip-hcu-homeconnect:0.4.0 --load .
```

Push the resulting image to your HCU as described in the official Connect API documentation.

### Source tarball

`npm run package` produces `dist/hmip-hcu-homeconnect-<version>.tar.gz` containing the full source. The GitHub action `.github/workflows/release.yml` builds and attaches it automatically on every `v*` tag push. Latest asset: [release page](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest).

### Configuration

All settings are exposed through the HCU's plugin configuration page. The plugin sends a `CONFIG_TEMPLATE_RESPONSE` describing the available properties.

| Property             | Type    | Default     | Description                                                                  |
|----------------------|---------|-------------|------------------------------------------------------------------------------|
| `clientId`           | string  | (required)  | Home Connect Application Client ID                                            |
| `language`           | enum    | `de-DE`     | Language for API responses (`de-DE`, `en-GB`, `en-US`, `fr-FR`, ...)           |
| `pollIntervalSec`    | int     | `0`         | Optional polling interval in seconds (0 = use event stream only)              |
| `debugDashboard`     | boolean | `false`     | Enable the local HTML debug dashboard                                         |
| `debugDashboardPort` | int     | `8123`      | TCP port the debug dashboard listens on                                       |
| `enableLight`        | boolean | `true`      | Expose appliance ambient lights as HCU `LIGHT` devices                        |
| `enableSwitch`       | boolean | `true`      | Expose appliance power state as HCU `SWITCH` devices                          |
| `enableClimate`      | boolean | `true`      | Expose fridge/freezer temperature as HCU `CLIMATE_SENSOR` devices             |
| `enablePrograms`     | boolean | `true`      | Expose a `SWITCH` per appliance to start/stop the currently selected program  |
| `enableEnergy`       | boolean | `true`      | Expose an `ENERGY_METER` per appliance with estimated power and kWh           |
| `resetSession`       | boolean | `false`     | One-shot: drop stored token and start a new device flow                       |
| `verboseLogging`     | boolean | `false`     | Log every WebSocket and Home Connect message                                  |

### Debug Dashboard

When `debugDashboard` is enabled, point your browser at `http://<hcu-or-host>:<debugDashboardPort>/` (default `8123`).

The dashboard pushes live updates over a WebSocket (`/ws`) and offers seven tabs:

- **Overview** — Plugin readiness, HCU/HC connection pills, OAuth session info, rate-limit progress bars, quick actions (refresh token, reload appliances, restart event stream, send test user message, reset login, download state.json), Verification URL display when login is pending.
- **Devices** — All mapped HCU devices and the original Home Connect appliances. Per appliance: live status, settings (inline editable, `PUT` per row), available programs, plus action buttons: start/abort program, Power On/Off, Open Door, reset kWh counter.
- **API** — Manual `GET/PUT/POST/DELETE` against the Home Connect API with quick-pick presets. Live history of the last 100 calls with status code, duration and inline error description.
- **Events** — Live ring buffer of the last 200 HCU WebSocket frames (in/out) and the last 200 Home Connect SSE events. Click a row for the full JSON.
- **Energy** — One mini SVG chart per `ENERGY_METER` device showing watts (blue) and kWh (green) over time.
- **Logs** — Live log stream with level filter, full-text filter, auto-scroll toggle and clear button.
- **Config** — Read-only view of the current persisted config.

The dashboard binds to all interfaces of the container; only expose the port on a trusted network.

### Architecture

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

- `index.js` — entry point, parses CLI args (`pluginId`, `host`, `tokenFile`), wires everything together.
- `hcuClient.js` — WebSocket client speaking the HCU Connect API.
- `homeconnect/api.js` — REST client with built-in rate limiting and token refresh.
- `homeconnect/auth.js` — OAuth2 device authorization flow.
- `homeconnect/events.js` — SSE event stream subscriber.
- `mapping.js` — maps Home Connect appliance types to HCU `DeviceType` and `Feature` arrays.
- `config.js` — builds the `CONFIG_TEMPLATE_RESPONSE` and persists user values.
- `state.js` — in-memory state, persisted to `data/plugin-state.json`.
- `dashboard.js` — optional HTML debug dashboard (no external deps, pure HTTP + WebSocket).
- `logger.js` — lightweight ring-buffered logger consumed by the dashboard.

### License

Apache-2.0. Home Connect is a trademark of BSH Hausgeräte GmbH; Homematic IP is a trademark of eQ-3 AG. This project is not affiliated with either company.
