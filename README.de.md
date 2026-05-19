> [ðŸ‡¬ðŸ‡§ English](README.md) | ðŸ‡©ðŸ‡ª Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-hcu-homeconnect Symbolbild" width="128" height="128"/>
</p>

# HMIP HCU Plugin: Home Connect

ðŸ“¦ **[hmip-hcu-homeconnect-0.5.1.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest/download/hmip-hcu-homeconnect-0.5.1.tar.gz)** â€” Installation in HCUweb Ã¼ber *Entwicklermodus â†’ Plugins â†’ Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-homeconnect>

Ein Node.js-Plugin fÃ¼r die Homematic IP Home Control Unit (HCU), das BSH
**Home Connect** GerÃ¤te (Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa)
ins Homematic IP System integriert.

> Inspiriert vom ioBroker.homeconnect-Adapter, gebaut gegen die
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
3. Plugin-Konfiguration auf der HCU Ã¶ffnen, Client ID eintragen, speichern.
4. In den Plugin-Logs die Verifizierungs-URL abgreifen, im Browser Ã¶ffnen und bestÃ¤tigen.
5. Die Home Connect GerÃ¤te erscheinen als HCU-GerÃ¤te.

## Funktionen

- **OAuth2 Device Flow** (kein Passwort gespeichert, nur eine Client ID).
- Live Event Stream Ã¼ber Server-Sent Events (`/api/homeappliances/events`).
- Automatische GerÃ¤teerkennung und Feature-Mapping auf HCU-GerÃ¤tearten.
- Ein/Aus schalten, Verbindungsstatus, TÃ¼r, Operation State, Restzeit,
  Stromverbrauch (wenn verfÃ¼gbar).
- **Programmsteuerung**: pro GerÃ¤t ein zusÃ¤tzlicher `SWITCH` â€” `ON` startet das
  aktuell auf dem GerÃ¤t gewÃ¤hlte Programm, `OFF` bricht es ab.
- **GeschÃ¤tzter EnergiezÃ¤hler** pro GerÃ¤t: `ENERGY_METER` mit `currentPower`
  und kumuliertem `energyCounter` in kWh.
- Umfangreiche **Konfigurationsseite**, vom HCU Ã¼ber `CONFIG_TEMPLATE_RESPONSE`
  gerendert.
- Optionales **HTML Debug Dashboard** mit Live-Logs, GerÃ¤telisten, letzten
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

Apache-2.0. Home Connect ist eine Marke der BSH HausgerÃ¤te GmbH; Homematic IP
ist eine Marke der eQ-3 AG. Dieses Projekt ist mit keinem der beiden Unternehmen
verbunden.
