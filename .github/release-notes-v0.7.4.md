# v0.7.4

## How to install

Download the attached `hmip-hcu-homeconnect-0.7.4.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*.

Already on a 0.7.x build? This release also ships a stable over-the-air (OTA)
payload, so an installed plugin on the `stable` channel updates itself without
a new upload.

## What's new

- The top-left name is now **HmIP HomeConnect** (debug dashboard and setup wizard).
- Update **channel** (stable / experimental) and **mode** (manual / auto) stay
  selectable under *Advanced*. After any update the plugin returns to the safe
  defaults — channel `stable`, mode `auto`.

## Compatibility

- HCU min version: 1.4.7 · Connect API: 1.0.1 · Architecture: arm64
- Ports: 8123 (debug dashboard, opt-in) · 8124 (setup wizard)
