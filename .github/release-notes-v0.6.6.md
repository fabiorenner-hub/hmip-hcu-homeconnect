# v0.6.6 — Setup wizard polish

This release smooths out the first-run experience: the setup wizard now properly
acknowledges a successful sign-in, the configuration page no longer shows a
wrong wall-clock time, and a stale verification URL is no longer revived after
a plugin restart.

## How to install

Download the attached `hmip-hcu-homeconnect-0.6.6.tar.gz` and upload it via
*HCUweb → Developer mode → Plugins → Install from file*.

## Highlights since 0.5.x

- **Setup wizard** at `http://<your-hcu-address>:8124/`. Three-step flow with
  step-by-step instructions for getting a Client ID, server-rendered QR code,
  WebSocket-driven live state, automatic shutdown after a successful sign-in.
- **Configuration page (HCUweb)** decluttered: paste the Client ID, click the
  link to api.home-connect.com, you're done. Fully bilingual (DE/EN), follows
  the `languageCode` from the HCU.
- **OAuth Device Flow logging** with full HTTP exchange, OAuth `error` /
  `error_description`, polling state and `x-request-id`, masked tokens.
- **Spec compliance fixes**: `PluginReadinessStatus` (`CONFIG_REQUIRED` /
  `READY` / `ERROR`), `CONFIG_UPDATE_RESPONSE.message` as String,
  `PluginMessage.id` always set.
- **EventSource v2 import** repaired so the live event stream works.
- **`INCLUSION_EVENT` / `EXCLUSION_EVENT`** properly handled.
- **Stale verification URL** no longer persisted across restarts.

## Fixes in 0.6.6

- Setup wizard now renders the success screen — previous order stopped the
  WebSocket server before the final state could be broadcast.
- Removed the wrong UTC timestamp from the configuration page status line
  (was showing 21:44 UTC when the user's wall clock said 23:44).
- `auth.login()` aborts any in-flight device-flow run before starting fresh,
  so "Restart login" works reliably.

## Verified appliances

- Bosch dishwasher, Bosch hood (smoke test)
- NEFF cooktop, NEFF oven (live)
- Should work on any BSH brand: Bosch, Siemens, Gaggenau, NEFF, Thermador, Constructa.

## Compatibility

- HCU min version: 1.4.7
- Connect API: 1.0.1
