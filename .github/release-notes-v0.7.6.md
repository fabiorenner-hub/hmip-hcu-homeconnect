# v0.7.6

## How to install

Download the attached `hmip-hcu-homeconnect-0.7.6.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*.

Already on a 0.7.x build on the `stable` channel? This release also ships a
stable over-the-air (OTA) payload, so the plugin updates itself without a new
upload.

## What's new

- More robust background network calls, including a fallback for runtimes
  without a global `fetch`.
- Extra diagnostics actions in the debug dashboard.

## Compatibility

- HCU min version: 1.4.7 · Connect API: 1.0.1 · Architecture: arm64
- Ports: 8123 (debug dashboard, opt-in) · 8124 (setup wizard)
