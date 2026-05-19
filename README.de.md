> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-hcu-homeconnect Symbolbild" width="128" height="128"/>
</p>

# HMIP HCU Plugin: Home Connect

📦 **[hmip-hcu-homeconnect-0.5.0.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest/download/hmip-hcu-homeconnect-0.5.0.tar.gz)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-homeconnect>

Ein Node.js-Plugin für die Homematic IP Home Control Unit (HCU), das BSH
**Home Connect** Geräte (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa)
ins Homematic IP System integriert.

> Inspiriert vom ioBroker.homeconnect-Adapter, gebaut gegen die
> [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api).

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie hilft
mir, weitere HCU-Plugins zu bauen und zu pflegen.

<form action="https://www.paypal.com/donate" method="post" target="_top"><input type="hidden" name="hosted_button_id" value="JPZRATUUHRT5C" /><input type="image" src="https://www.paypalobjects.com/de_DE/DE/i/btn/btn_donate_SM.gif" border="0" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Spenden mit dem PayPal-Button" /><img alt="" border="0" src="https://www.paypal.com/de_DE/i/scr/pixel.gif" width="1" height="1" /></form>

## Schnellstart

1. Kostenlosen Developer-Account unter
   [developer.home-connect.com](https://developer.home-connect.com) anlegen und
   eine Application mit **Device Flow** als OAuth-Flow erstellen. Die `Client ID` kopieren.
2. `hmip-hcu-homeconnect-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases)
   laden und auf der HCU installieren.
3. Plugin-Konfiguration auf der HCU öffnen, Client ID eintragen, speichern.
4. In den Plugin-Logs die Verifizierungs-URL abgreifen, im Browser öffnen und bestätigen.
5. Die Home Connect Geräte erscheinen als HCU-Geräte.

## Funktionen

- **OAuth2 Device Flow** (kein Passwort gespeichert, nur eine Client ID).
- Live Event Stream über Server-Sent Events (`/api/homeappliances/events`).
- Automatische Geräteerkennung und Feature-Mapping auf HCU-Gerätearten.
- Ein/Aus schalten, Verbindungsstatus, Tür, Operation State, Restzeit,
  Stromverbrauch (wenn verfügbar).
- **Programmsteuerung**: pro Gerät ein zusätzlicher `SWITCH` — `ON` startet das
  aktuell auf dem Gerät gewählte Programm, `OFF` bricht es ab.
- **Geschätzter Energiezähler** pro Gerät: `ENERGY_METER` mit `currentPower`
  und kumuliertem `energyCounter` in kWh.
- Umfangreiche **Konfigurationsseite**, vom HCU über `CONFIG_TEMPLATE_RESPONSE`
  gerendert.
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

Heraus kommt `hmip-hcu-homeconnect-<version>.tar.gz`.

## Herausgeber

Herausgegeben von **Fabio Renner**.

## Lizenz

Apache-2.0. Home Connect ist eine Marke der BSH Hausgeräte GmbH; Homematic IP
ist eine Marke der eQ-3 AG. Dieses Projekt ist mit keinem der beiden Unternehmen
verbunden.
