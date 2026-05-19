'use strict';

const axios = require('axios');
const qs = require('qs');

const HC_BASE = 'https://api.home-connect.com';
const SCOPES = 'IdentifyAppliance Monitor Settings Control';

/**
 * OAuth2 Device Authorization flow against Home Connect.
 *
 * Flow:
 * 1. POST /security/oauth/device_authorization → { device_code, verification_uri_complete, ... }
 * 2. Show verification URL to user (also forwarded to HCU as user message).
 * 3. Poll POST /security/oauth/token until user approved.
 * 4. Store access + refresh token.
 */
class HomeConnectAuth {
	constructor({ logger, state, onVerificationUrl }) {
		this.logger = logger;
		this.state = state;
		this.onVerificationUrl = onVerificationUrl;
		this._aborted = false;
	}

	abort() {
		this._aborted = true;
	}

	async login() {
		const clientId = this.state.config.clientId;
		if (!clientId) {
			throw new Error('Home Connect Client ID is not configured');
		}

		this.logger.info('Starting Home Connect device authorization flow');
		const deviceAuth = await this._requestDeviceCode(clientId);

		this.state.lastVerificationUrl = deviceAuth.verification_uri_complete;
		if (this.onVerificationUrl) {
			try {
				await this.onVerificationUrl(deviceAuth.verification_uri_complete);
			} catch (e) {
				this.logger.warn('onVerificationUrl callback failed:', e.message);
			}
		}

		this.logger.warn('====================================================');
		this.logger.warn('Open this URL in your browser to approve Home Connect:');
		this.logger.warn(deviceAuth.verification_uri_complete);
		this.logger.warn('====================================================');

		const interval = Math.max(5, deviceAuth.interval || 5) * 1000;
		const expiresAt = Date.now() + (deviceAuth.expires_in || 600) * 1000;

		while (!this._aborted && Date.now() < expiresAt) {
			await sleep(interval);
			try {
				const token = await this._pollForToken(clientId, deviceAuth.device_code);
				if (token) {
					this._persistToken(token);
					this.logger.info('Home Connect login successful');
					return token;
				}
			} catch (e) {
				const code = e?.response?.data?.error;
				if (code === 'authorization_pending' || code === 'slow_down') {
					this.logger.debug('Awaiting user approval...');
					continue;
				}
				if (code === 'expired_token' || code === 'access_denied') {
					throw new Error(`Device flow ended: ${code}`);
				}
				this.logger.warn('Token poll error:', e.message);
			}
		}

		throw new Error('Device authorization timed out');
	}

	async refresh() {
		const session = this.state.session;
		if (!session?.refresh_token) {
			throw new Error('No refresh token available');
		}
		this.logger.debug('Refreshing Home Connect access token');
		const res = await axios.post(
			`${HC_BASE}/security/oauth/token`,
			`grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refresh_token)}`,
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
		);
		this._persistToken(res.data);
		return res.data;
	}

	_persistToken(token) {
		const next = Date.now() + parseInt(token.expires_in || 0, 10) * 1000;
		this.state.session = { ...token, next };
	}

	async _requestDeviceCode(clientId) {
		const res = await axios.post(
			`${HC_BASE}/security/oauth/device_authorization`,
			qs.stringify({ client_id: clientId, scope: SCOPES }),
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
		);
		return res.data;
	}

	async _pollForToken(clientId, deviceCode) {
		const res = await axios.post(
			`${HC_BASE}/security/oauth/token`,
			qs.stringify({
				grant_type: 'device_code',
				device_code: deviceCode,
				client_id: clientId,
			}),
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
		);
		return res.data;
	}
}

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

module.exports = { HomeConnectAuth, HC_BASE };
