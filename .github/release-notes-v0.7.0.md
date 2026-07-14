# v0.7.0 — Over-the-air updates

This release adds an over-the-air (OTA) update system so future versions can be
delivered without a manual `.tar.gz` upload, on two channels: **stable** and
**experimental**.

## How to install

Download the attached `hmip-hcu-homeconnect-0.7.0.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*.

This is the first image with the bootstrap loader; install it once via HCUweb.
From here on, updates on your selected channel can arrive over the air (major
upgrades that require a newer core still ship as a `.tar.gz`).

## What's new

- **OTA updates** with `stable` / `experimental` channels, manual or automatic
  mode, and a configurable check interval (under *Advanced*).
- A bootstrap loader picks between the baked-in image and an installed OTA
  payload, with **crash-loop protection**: a payload that fails to start three
  times is quarantined and the plugin rolls back to the image automatically.
- A newer core image always supersedes an older OTA payload; integrity is
  verified via sha256 before a payload is activated.
- The app is bundled into a single self-contained file, so OTA payloads run
  without `node_modules`.
- Hardening: global unhandled-rejection / uncaught-exception handlers so an
  async error never aborts installation.

## Compatibility

- HCU min version: 1.4.7
- Connect API: 1.0.1
- Architecture: arm64
- Ports: 8123 (debug dashboard, opt-in) · 8124 (setup wizard)

See `CHANGELOG.md` for the full list and `docs`/README (DE + EN) for details.
