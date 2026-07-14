# v0.7.5

## How to install

Download the attached `hmip-hcu-homeconnect-0.7.5.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*.

Already on a 0.7.x build on the `stable` channel? This release also ships a
stable over-the-air (OTA) payload, so the plugin updates itself without a new
upload.

## What's new

- The **Updates tab** in the debug dashboard now lets you change the update
  **channel** (stable / experimental), **mode** (manual / auto) and **check
  interval** directly — those values were previously read-only.
- The update channel is **no longer reset automatically** on an update; your
  chosen channel and mode are kept.

## Compatibility

- HCU min version: 1.4.7 · Connect API: 1.0.1 · Architecture: arm64
- Ports: 8123 (debug dashboard, opt-in) · 8124 (setup wizard)
