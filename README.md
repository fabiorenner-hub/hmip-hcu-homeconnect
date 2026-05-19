> 🇬🇧 English | [🇩🇪 Deutsch](README.de.md)

<p align="center">
  <img src="icon.svg" alt="hmip-hcu-homeconnect icon" width="128" height="128"/>
</p>

# HMIP HCU Plugin: Home Connect

📦 **[Download hmip-hcu-homeconnect-0.5.0.tar.gz](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases/latest/download/hmip-hcu-homeconnect-0.5.0.tar.gz)** — install via HCUweb → *Developer mode → Plugins → Install from file*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-homeconnect>

A Node.js plugin for the Homematic IP Home Control Unit (HCU) that integrates
BSH **Home Connect** household appliances (Bosch, Siemens, Gaggenau, NEFF,
Thermador, Constructa) into the Homematic IP system.

> Inspired by the ioBroker.homeconnect adapter, built against the
> [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api).

## Support this plugin

If this plugin is useful to you, please consider a small donation — it helps
me keep the lights on while building more HCU plugins.

<form action="https://www.paypal.com/donate" method="post" target="_top"><input type="hidden" name="hosted_button_id" value="JPZRATUUHRT5C" /><input type="image" src="https://www.paypalobjects.com/de_DE/DE/i/btn/btn_donate_SM.gif" border="0" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Spenden mit dem PayPal-Button" /><img alt="" border="0" src="https://www.paypal.com/de_DE/i/scr/pixel.gif" width="1" height="1" /></form>

## Quick start

1. Register a free developer account at
   [developer.home-connect.com](https://developer.home-connect.com) and create
   an application using **Device Flow** as the OAuth flow. Copy the `Client ID`.
2. Download `hmip-hcu-homeconnect-<version>.tar.gz` from the
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/releases)
   and install it on your HCU.
3. Open the plugin configuration on the HCU, enter your Client ID, save.
4. Watch the plugin logs for the verification URL, open it in your browser
   and approve.
5. Your Home Connect appliances appear as HCU devices.

## Features

- **OAuth2 Device Flow** login (no user/password stored, only a Client ID).
- Live event stream via Server-Sent Events (`/api/homeappliances/events`).
- Automatic device discovery and feature mapping to HCU device archetypes.
- Switch on/off, monitor connection state, door, operation state, remaining
  time, power consumption (where available).
- **Program control**: per appliance one extra `SWITCH` — `ON` starts the
  currently selected program, `OFF` aborts it.
- **Estimated energy meter** per appliance: `ENERGY_METER` with `currentPower`
  and accumulated `energyCounter` in kWh.
- Extensive **config page** rendered by the HCU via `CONFIG_TEMPLATE_RESPONSE`.
- Optional **HTML debug dashboard** with live logs, device inventory, last API
  calls, rate-limit counters and token state.
- Built-in client-side rate limiting that honors the Home Connect quotas
  (50 req/min, ~1000 req/day, token refresh limits).

## Building

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

The output is `hmip-hcu-homeconnect-<version>.tar.gz`.

## Author

Issued by **Fabio Renner**.

## License

Apache-2.0. Home Connect is a trademark of BSH Hausgeräte GmbH; Homematic IP
is a trademark of eQ-3 AG. This project is not affiliated with either company.
