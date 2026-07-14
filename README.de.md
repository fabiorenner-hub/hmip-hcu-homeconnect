> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-hcu-homeconnect Symbolbild" width="128" height="128"/>
</p>

# Home Connect für Homematic IP

Bring deine Bosch, Siemens, Gaggenau, NEFF, Thermador oder Constructa Geräte
in Homematic IP. Ohne Cloud-Bridge, ohne Raspberry Pi.

📦 **[Aktuelles Plugin herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

[![Lizenz: Apache-2.0](https://img.shields.io/badge/Lizenz-Apache%202.0-blue.svg)](LICENSE)
[![Connect API 1.0.1](https://img.shields.io/badge/Connect%20API-1.0.1-green)](https://github.com/homematicip/connect-api)

---

## Was es kann

Nach drei Minuten Einrichtung tauchen deine Geräte als Homematic IP Geräte
auf. Ein/Aus, verbleibende Programmzeit, Programm starten, Türstatus,
geschätzter Energieverbrauch — alles direkt in der Homematic IP App, in
Szenen, Gruppen und Automatisierungen.

| Funktion                  | Was du bekommst                                |
| ------------------------- | ---------------------------------------------- |
| ⚡ Power                   | `SWITCH` — Gerät ein-/ausschalten              |
| 💡 Innenlicht              | `LIGHT` — Hauben-, Backofen- oder Kühlschrankl. |
| 🌡️ Kühltemperatur          | `CLIMATE_SENSOR` — Kühl-/Gefrier-Sollwert      |
| ▶️ Programmsteuerung       | `SWITCH` — gewähltes Programm starten/abbrechen |
| 🔌 Energiezähler          | `ENERGY_METER` — `currentPower` und `kWh`      |

Das Plugin nutzt den Live-Event-Stream von Home Connect, Statusänderungen
sind in Sekunden sichtbar — kein Polling nötig.

## Einrichtung in 3 Schritten

### Schritt 1 — Client ID besorgen

1. [developer.home-connect.com/applications](https://developer.home-connect.com/applications)
   öffnen und einloggen. Falls noch kein Account vorhanden, oben rechts
   *Register* klicken (kostenlos, dauert eine Minute).
2. Im Dashboard oben rechts auf **Register Application** klicken.
3. Das Formular **genau** so ausfüllen:

   | Feld | Wert | Hinweis |
   | ---- | ---- | ------- |
   | Application ID | beliebig, z.B. `HCU Plugin` | Nur für dich sichtbar |
   | OAuth Flow | **`Device Flow`** | ⚠️ **Häufigster Fehler — muss Device Flow sein, nicht Authorization Code Grant Flow.** |
   | Home Connect User Account for Testing | deine eigene Home Connect E-Mail | Derselbe Account, dem die Geräte gehören |
   | Success Redirect | *(leer)* | Wird vom Device Flow nicht genutzt |
   | One Time Token Mode | *Disabled* | |
   | Proof Key for Code Exchange | *Disabled* | |

4. **Save** klicken.
5. Auf der Detailseite die **Client ID** kopieren — ein 64 Zeichen langer
   Hex-String (Großbuchstaben). Das **Client Secret brauchst du nicht**.

### Schritt 2 — Plugin installieren

1. Aktuelle `hmip-hcu-homeconnect-<version>.tar.gz` von der
   [Releases-Seite](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases)
   laden.
2. In HCUweb den *Entwicklermodus* aktivieren, *Plugins* öffnen, auf
   *Aus Datei installieren* klicken und das Tarball hochladen.
3. Nach wenigen Sekunden erscheint das Plugin in der Liste.

### Schritt 3 — Anmelden

1. Plugin-Konfigurationsseite in HCUweb öffnen.
2. **Client ID** einfügen, *Speichern*.
3. Die Seite zeigt jetzt in der Sektion *Anmeldung* einen **Anmeldelink**
   und einen **QR-Code**. Der Link führt direkt auf `api.home-connect.com`
   und funktioniert von jedem Gerät mit Internet — Laptop, Handy,
   beliebig.
4. Link öffnen (oder QR-Code mit dem Handy scannen), bei Home Connect
   mit dem in der Application hinterlegten Account anmelden und *Allow*
   bestätigen.
5. Plugin-Konfigurationsseite einmal neu laden. Der Status wechselt auf
   `✓ Mit Home Connect verbunden.` und deine Geräte erscheinen in der
   Homematic IP App.

Fertig. Das Plugin merkt sich die Anmeldung auch über HCU-Neustarts hinweg.

### Neu anmelden

Falls du dich erneut anmelden willst (z.B. nach Wechsel der Client ID),
öffne die Plugin-Konfigurationsseite, aktiviere **Anmeldung neu starten**
und speichere. Ein frischer Anmeldelink erscheint.

### Erweitert: Setup-Wizard auf Port 8124

Das Plugin bietet zusätzlich einen ausführlicheren Setup-Wizard unter
`http://<container-ip>:8124/` an. Auf einer Standard-HCU ist dieser Port
**nicht** vom LAN aus erreichbar (das Plugin läuft in einer Container-Sandbox,
nur die HCU selbst kann den Port erreichen). Er ist für Setups gedacht,
in denen der Port manuell ans LAN durchgereicht wurde.

## Konfigurationsreferenz

Alles außer der Client ID hat einen vernünftigen Standardwert.

| Sektion | Einstellung | Standard | Hinweise |
| ------- | ----------- | -------- | -------- |
| Anmeldung | Client ID | *(leer)* | 64 Hex-Zeichen aus dem Home Connect Developer-Portal |
| Anmeldung | Anmeldung neu starten | aus | Aktivieren + speichern, um den gespeicherten Login zu verwerfen und einen neuen Anmeldelink zu erzeugen |
| Geräte | Ein/Aus-Schalter | an | Power pro Gerät |
| Geräte | Innen-/Ambientelicht | an | Innenlicht von Dunstabzug, Backofen, Kühlschrank |
| Geräte | Kühltemperatur | an | Kühl-/Gefrier-Sollwert |
| Geräte | Programmsteuerung | an | Gewähltes Programm starten (ON), abbrechen (OFF) |
| Geräte | Energiezähler | an | Geschätzter `currentPower` + kumulierter `kWh` |
| Erweitert | Sprache | `de-DE` | Sprache für Programmnamen |
| Erweitert | Polling-Intervall | 0 (aus) | Zusätzlich zum Live-Event-Stream |
| Erweitert | Diagnose-Dashboard | aus | Web-UI auf `http://<HCU-IP>:8123/` |
| Erweitert | Ausführliches Logging | aus | Loggt jeden API- und HCU-Frame |

## Diagnose-Dashboard (optional)

*Diagnose-Dashboard* unter *Erweitert* einschalten. Das Plugin bietet dann
unter `http://<HCU-IP>:8123/` ein kleines Web-UI mit sieben Tabs:

- **Overview** — Status, HCU-Verbindung, Home Connect Token
- **Geräte** — alle Geräte mit Live-Settings und Status
- **API** — direkte `GET/PUT/POST/DELETE`-Konsole für die Home Connect REST API
- **Events** — Live-SSE-Stream
- **Energie** — Sparkline-Charts und kWh-Zähler
- **Logs** — filterbarer Log-Stream
- **Config** — aktuelle Konfiguration als JSON

Nicht außerhalb des Heimnetzes erreichbar machen — keine Auth.

## Updates (Over-the-Air)

Unter *Erweitert* wählst du **Update-Kanal** und **Modus**:

- **stable** (Standard) — geprüfte GitHub-Releases.
- **experimental** — rollierende Vorabversionen, die über-the-air ohne neues
  `.tar.gz`/HCUweb-Upload ausgeliefert werden. Für Tester.
- **Modus** `manual` (Standard) prüft im Hintergrund und installiert auf
  Knopfdruck; `auto` installiert neue Versionen im gewählten Kanal automatisch.

Das Plugin startet über einen kleinen Bootstrap-Loader, der entweder das
eingebackene Image oder ein installiertes OTA-Payload fährt — mit
Crash-Loop-Schutz: startet ein OTA-Payload dreimal nicht, wird es in Quarantäne
gestellt und das Plugin fällt automatisch aufs Image zurück. Ein neueres
Core-Image gewinnt immer gegen ein älteres OTA-Payload. Große Upgrades, die
einen neueren Core brauchen, kommen weiterhin als `.tar.gz` über HCUweb.

## Anonyme Nutzungsstatistik

Damit ersichtlich ist, wie viele Installationen es gibt und welche
Versionen/Firmware im Umlauf sind, sendet das Plugin eine **anonyme
Nutzungsstatistik**. Das ist **standardmäßig aktiv** und lässt sich jederzeit
unter *Erweitert → Anonyme Nutzungsstatistik senden* **abschalten** (Opt-out).

Übertragen werden nur pseudonyme technische Metadaten: Schema-Version, Event
(`start` / `heartbeat` / `update`), eine anonyme Install-ID, Plugin-ID,
Plugin-/Core-/OTA-Version, Build-ID, CPU-Architektur, HCU-Firmware und die
2-Buchstaben-Sprache. Die Install-ID ist ein SHA-256-Hash (64 Hex-Zeichen) —
die HCU-Seriennummer/SGTIN wird **nie** übertragen.

Niemals gesendet werden Namen, Seriennummern, IP-Adressen, E-Mail, Standort,
Räume, Gerätenamen/-adressen, Messwerte, Automationen, Zeitpläne,
Konfigurationsinhalte oder Tokens. Der genaue Payload ist über die
`analyticsPreview`-Aktion im Debug-Dashboard einsehbar. Der Versand erfolgt
„fire and forget" mit kurzen Timeouts und blockiert das Plugin nie. Zum
Deaktivieren einfach den Schalter ausschalten.

## Fehlerbehebung

| Symptom | Wahrscheinliche Ursache | Lösung |
| ------- | ----------------------- | ------ |
| `unauthorized_client: client not authorized for this oauth flow` | Application im Home Connect Portal steht auf *Authorization Code Grant Flow*. | OAuth Flow im Developer-Portal auf **Device Flow** ändern. |
| `unauthorized_client: client has limited user list - user not assigned to client` | Du meldest dich mit einem anderen Account an als dem in der Application hinterlegten. | Im Developer-Portal unter *Home Connect User Account for testing* die richtige E-Mail eintragen. |
| `Konfiguration übernommen`, aber keine Geräte erscheinen | Anmeldelink noch offen. | Anmeldelink von der Konfigurationsseite (oder per QR) öffnen, bestätigen, dann Seite neu laden. |
| Plugin meldet dauernd `Konfiguration ausstehend` | Client ID ist falsch (muss exakt 64 Hex-Zeichen sein). | Client ID nochmal aus dem Home Connect Portal kopieren. |

Für tiefere Analyse *Ausführliches Logging* aktivieren und die Plugin-Logs
in HCUweb prüfen — jede HTTP-Kommunikation mit Home Connect ist mit Status,
`x-request-id` und OAuth-`error` / `error_description` geloggt.

## Aus dem Quellcode bauen

```powershell
# Windows
./build.ps1
```

```bash
# macOS / Linux
chmod +x build.sh
./build.sh
```

Das Build-Skript liest die Version aus `package.json`, baut ein
`linux/arm64` Docker-Image mit dem Connect-API-Metadaten-Label, ruft
`docker save` auf, packt das Ganze als `dist/hmip-hcu-homeconnect-<version>.tar.gz`
und spiegelt es in den Repo-Root.

Tests via `npm test` (Smoke + Dashboard-E2E).

## Spenden

Wenn dir dieses Plugin Zeit spart: [Spenden via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).
Hält bei mir die Lichter an, während ich weitere HCU-Plugins baue.

## Danke und Lizenz

Gebaut gegen die [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api)
von eQ-3. Verwendet die offizielle [Home Connect Developer API](https://developer.home-connect.com/)
per OAuth2 Device Flow. Mapping inspiriert von [`ioBroker.homeconnect`](https://github.com/bowm0815/ioBroker.homeconnect) (MIT).

Apache-2.0. *Home Connect* ist eine Marke der BSH Hausgeräte GmbH;
*Homematic IP* ist eine Marke der eQ-3 AG. Markennamen (Bosch, Siemens,
Gaggenau, NEFF, Thermador, Constructa) gehören den jeweiligen Eigentümern.
Dieses Projekt ist mit keinem der beiden Unternehmen verbunden.

Herausgegeben von **Fabio Renner**.
