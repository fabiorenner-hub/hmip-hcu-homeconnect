# v0.7.1 — OTA on by default + polished update UI

Builds on the over-the-air update system from 0.7.0.

## How to install

Download the attached `hmip-hcu-homeconnect-0.7.1.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*. Once installed, future
updates on the stable channel arrive automatically over the air.

## What's new

- **OTA is on by default** — update mode is now `auto` on the `stable` channel.
- **New Updates tab** in the debug dashboard: a clear step-by-step install UI
  (Download → Installation → Restart → Done) with a progress bar, running vs.
  latest version, "check now" / "update now" buttons and a header badge when an
  update is available.
- **Smoother install**: the restart mid-update is handled gracefully. The button
  is disabled for the whole install → restart → reconnect cycle, the brief
  connection drop is shown as progress (not an error), and the UI reloads itself
  once the new version is back up. No more "failed to fetch".

## Compatibility

- HCU min version: 1.4.7
- Connect API: 1.0.1
- Architecture: arm64
- Ports: 8123 (debug dashboard, opt-in) · 8124 (setup wizard)
