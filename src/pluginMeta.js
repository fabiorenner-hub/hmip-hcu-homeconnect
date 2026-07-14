'use strict';

/**
 * The single place with project-specific values. Everything else imports
 * from here instead of hardcoding.
 *
 * Note: pluginId stays `de.kiro.plugin.homeconnect` — this plugin is already
 * installed on HCUs under that id; changing it would orphan existing devices.
 */
const PLUGIN_ID = 'de.kiro.plugin.homeconnect';
const GITHUB_REPO = 'fabiorenner-hub/hmip-hcu-homeconnect';
const ENV_PREFIX = 'HOMECONNECT';
const DASHBOARD_PORT = 8123; // Port-Registry: Home Connect = 8123

module.exports = { PLUGIN_ID, GITHUB_REPO, ENV_PREFIX, DASHBOARD_PORT };
