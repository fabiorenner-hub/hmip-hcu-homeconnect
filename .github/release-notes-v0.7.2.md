# v0.7.2 — anonymous usage statistics

## How to install

Download the attached `hmip-hcu-homeconnect-0.7.2.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*.

## What's new

- **Anonymous usage statistics** to help gauge install count, active installs
  and which plugin versions / HCU firmware are in the field.
  - **On by default**, and you can **turn it off** any time under
    *Advanced → Send anonymous usage statistics* (opt-out).
  - Sends only pseudonymous technical metadata: schema, event
    (`start` / `heartbeat` once per 24 h / `update`), a SHA-256 install id
    (64 hex; the HCU serial/SGTIN is never transmitted), plugin id,
    plugin/core/OTA version, build id, CPU architecture, HCU firmware and the
    2-letter language.
  - **Never** sends names, serial numbers, IP addresses, e-mail, location,
    rooms, device names/addresses, measurements, automations, schedules,
    configuration or tokens.
  - Fire-and-forget: 3 s connect / 5 s total timeout, backoff on failure,
    ≤4096-byte payload; it never blocks the plugin. The exact payload is
    viewable via the `analyticsPreview` action on the debug dashboard.

## Compatibility

- HCU min version: 1.4.7 · Connect API: 1.0.1 · Architecture: arm64
- Ports: 8123 (debug dashboard, opt-in) · 8124 (setup wizard)
