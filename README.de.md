> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-hcu-homeconnect Symbolbild" width="128" height="128"/>
</p>

# HMIP HCU Plugin: Home Connect

📦 **[hmip-hcu-homeconnect-0.5.2.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest/download/hmip-hcu-homeconnect-0.5.2.tar.gz)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-homeconnect>

Ein Node.js-Plugin für die Homematic IP Home Control Unit (HCU), das BSH
**Home Connect** Geräte (Bosch, Siemens, Gaggenau, NEFF, Thermador,
Constructa) ins Homematic IP System integriert.

> Gebaut gegen die
> [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api).

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie
hält bei mir die Lichter an, während ich weitere HCU-Plugins baue:
[Spenden via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## Schnellstart

1. Kostenlosen Developer-Account unter
   [developer.home-connect.com](https://developer.home-connect.com) anlegen und
   eine Application mit **Device Flow** als OAuth-Flow erstellen. Die `Client ID` kopieren.
2. `hmip-hcu-homeconnect-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases)
   laden und auf der HCU installieren.
3. Plugin-Konfiguration auf der HCU öffnen, Client ID eintragen, speichern.
4. In den Plugin-Logs die Verifizierungs-URL abgreifen, im Browser öffnen
   und bestätigen.
5. Deine Home Connect Geräte erscheinen als HCU-Geräte.

## Funktionen

- **OAuth2 Device Flow** Login (kein Passwort gespeichert, nur eine Client ID).
- Live-Event-Stream über Server-Sent Events.
- Automatische Geräteerkennung und Feature-Mapping auf HCU-Gerätearten.
- Ein/Aus schalten, Verbindungsstatus, Tür, Operation State, Restzeit,
  Stromverbrauch (wenn verfügbar).
- **Programmsteuerung**: pro Gerät ein zusätzlicher `SWITCH` — `ON` startet
  das aktuell gewählte Programm, `OFF` bricht es ab.
- **Geschätzter Energiezähler** pro Gerät: `ENERGY_METER` mit `currentPower`
  und kumuliertem `energyCounter` in kWh.
- Umfangreiche **Konfigurationsseite**, vom HCU gerendert.
- Optionales **HTML Debug Dashboard** mit Live-Logs, Gerätelisten, letzten
  API-Calls, Rate-Limit-Statistiken und Token-Status.
- Eingebautes Rate-Limiting, das die Home Connect Quotas respektiert
  (50 Req/Min, ~1000 Req/Tag, Token-Refresh-Limits).

## Bauen

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## Herausgeber

Herausgegeben von **Fabio Renner**.

### Verwendete Drittanbieter

- Verwendet die offizielle [BSH Home Connect Developer API](https://developer.home-connect.com/) per OAuth2 Device Flow.
- Mapping und OAuth-Flow inspiriert von [`ioBroker.homeconnect`](https://github.com/bowm0815/ioBroker.homeconnect) (MIT).
- [`axios`](https://github.com/axios/axios) — HTTP-Client (MIT). [`eventsource`](https://github.com/EventSource/eventsource) — SSE-Client (MIT). [`qs`](https://github.com/ljharb/qs) — Query-String-Parser (BSD-3-Clause).
- Home Connect ist eine Marke der BSH Hausgeräte GmbH; Markennamen (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa) gehören den jeweiligen Eigentümern. Dieses Plugin ist mit BSH nicht verbunden und wird nicht unterstützt.
- Gebaut gegen die [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api) von eQ-3.

## Lizenz

Apache-2.0. Home Connect ist eine Marke der BSH Hausgeräte GmbH; Homematic IP
ist eine Marke der eQ-3 AG. Dieses Projekt ist mit keinem der beiden
Unternehmen verbunden.
