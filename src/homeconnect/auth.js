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
 *
 * Logging philosophy: we log every HTTP exchange in INFO so the operator
 * sees exactly what is sent and what comes back. Sensitive values
 * (client_id, device_code, refresh_token, access_token) are masked.
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
		// If a previous device-flow run is still polling, stop it first.
		this._aborted = true;
		// Yield once so the running loop has a chance to see the abort
		// before we set _aborted = false again below.
		await sleep(0);
		this._aborted = false;
		const clientId = this.state.config.clientId;
		if (!clientId) {
			throw new Error('Home Connect Client ID is not configured');
		}
		// Per Home Connect API docs the Client ID is exactly 64 chars. Reject
		// obvious typos before bothering the server, so the user gets an
		// actionable message instead of a generic HTTP 400.
		const trimmed = clientId.trim();
		this.logger.info(
			`Home Connect Client ID: length=${trimmed.length}, prefix=${mask(trimmed)}, ` +
			`hexOnly=${/^[0-9A-Fa-f]+$/.test(trimmed)}`,
		);
		if (trimmed.length !== 64) {
			throw new Error(
				`Home Connect Client ID must be exactly 64 characters (got ${trimmed.length}). ` +
				'Copy the value from https://developer.home-connect.com/applications.',
			);
		}
		if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
			throw new Error(
				'Home Connect Client ID contains characters that are not letters or digits. ' +
				'Copy the value verbatim from the developer portal.',
			);
		}

		this.logger.info('Starting Home Connect device authorization flow');
		this.logger.info(`Requesting device code with scope='${SCOPES}'`);
		const deviceAuth = await this._requestDeviceCode(trimmed);
		this.logger.info(
			`Device code obtained: user_code=${deviceAuth.user_code}, ` +
			`expires_in=${deviceAuth.expires_in}s, interval=${deviceAuth.interval}s, ` +
			`verification_uri=${deviceAuth.verification_uri}`,
		);

		this.state.lastVerificationUrl = deviceAuth.verification_uri_complete;
		this.state.lastVerificationStatus = {
			state: 'pending',
			message: `Warte auf Bestätigung im Browser (Code ${deviceAuth.user_code}).`,
			at: new Date().toISOString(),
		};
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
		this.logger.info(
			`Polling token endpoint every ${interval / 1000}s until ` +
			`${new Date(expiresAt).toISOString()}`,
		);

		let pollCount = 0;
		while (!this._aborted && Date.now() < expiresAt) {
			await sleep(interval);
			pollCount += 1;
			try {
				const token = await this._pollForToken(trimmed, deviceAuth.device_code);
				if (token) {
					this._persistToken(token);
					this.state.lastVerificationUrl = null;
					this.state.lastVerificationStatus = {
						state: 'ok',
						message: `Angemeldet (Scope: ${token.scope || 'unbekannt'}).`,
						at: new Date().toISOString(),
					};
					this.logger.info(
						`Home Connect login successful after ${pollCount} poll(s). ` +
						`Granted scope='${token.scope || '(missing)'}', ` +
						`expires_in=${token.expires_in}s, token_type=${token.token_type || 'Bearer'}, ` +
						`access_token=${mask(token.access_token)}, refresh_token=${mask(token.refresh_token)}`,
					);
					return token;
				}
			} catch (e) {
				const code = e?.oauthError || e?.response?.data?.error;
				const desc = e?.oauthErrorDescription || e?.response?.data?.error_description;
				if (code === 'authorization_pending') {
					this.logger.info(`Poll #${pollCount}: still waiting for user approval (authorization_pending)`);
					continue;
				}
				if (code === 'slow_down') {
					this.logger.info(`Poll #${pollCount}: server requested slower polling (slow_down)`);
					continue;
				}
				if (code === 'expired_token' || code === 'access_denied') {
					throw new Error(`Device flow ended: ${code}${desc ? ` (${desc})` : ''}`);
				}
				this.logger.warn(`Poll #${pollCount} error: ${e.message}`);
			}
		}

		throw new Error('Device authorization timed out');
	}

	async refresh() {
		const session = this.state.session;
		if (!session?.refresh_token) {
			throw new Error('No refresh token available');
		}
		this.logger.info('Refreshing Home Connect access token');
		this.logger.debug(
			`POST ${HC_BASE}/security/oauth/token grant_type=refresh_token ` +
			`refresh_token=${mask(session.refresh_token)}`,
		);
		try {
			const res = await axios.post(
				`${HC_BASE}/security/oauth/token`,
				`grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refresh_token)}`,
				{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
			);
			this.logger.info(
				`Token refresh ok: HTTP ${res.status}, expires_in=${res.data?.expires_in}s, ` +
				`scope='${res.data?.scope || '(missing)'}', access_token=${mask(res.data?.access_token)}`,
			);
			this._persistToken(res.data);
			return res.data;
		} catch (e) {
			throw decorateOAuthError(e, 'token (refresh)', this.logger);
		}
	}

	_persistToken(token) {
		const next = Date.now() + parseInt(token.expires_in || 0, 10) * 1000;
		this.state.session = { ...token, next };
	}

	async _requestDeviceCode(clientId) {
		const url = `${HC_BASE}/security/oauth/device_authorization`;
		const body = { client_id: clientId, scope: SCOPES };
		const encoded = qs.stringify(body);
		this.logger.info(`HTTP POST ${url}`);
		this.logger.info('  Headers: Content-Type=application/x-www-form-urlencoded');
		this.logger.info(
			`  Body: client_id=${mask(clientId)} scope='${SCOPES}' ` +
			`(${encoded.length} bytes encoded)`,
		);
		const t0 = Date.now();
		try {
			const res = await axios.post(url, encoded, {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				timeout: 15000,
				validateStatus: () => true, // we want to log non-2xx ourselves
			});
			const dt = Date.now() - t0;
			this.logger.info(`  Response: HTTP ${res.status} ${res.statusText || ''} in ${dt}ms`);
			this._logResponseHeaders(res.headers);
			if (res.status >= 200 && res.status < 300) {
				this.logger.info(`  Body keys: ${Object.keys(res.data || {}).join(', ')}`);
				return res.data;
			}
			// Non-2xx: build a faux axios error so decorateOAuthError can format it.
			const err = new Error(`HTTP ${res.status}`);
			err.response = res;
			throw decorateOAuthError(err, 'device_authorization', this.logger);
		} catch (e) {
			if (e.oauthError !== undefined) throw e; // already decorated
			if (e.response) throw decorateOAuthError(e, 'device_authorization', this.logger);
			this.logger.error(`  Network error: ${e.code || ''} ${e.message}`);
			throw e;
		}
	}

	async _pollForToken(clientId, deviceCode) {
		const url = `${HC_BASE}/security/oauth/token`;
		const body = { grant_type: 'device_code', device_code: deviceCode, client_id: clientId };
		const encoded = qs.stringify(body);
		this.logger.debug(
			`HTTP POST ${url} grant_type=device_code device_code=${mask(deviceCode)} ` +
			`client_id=${mask(clientId)}`,
		);
		const t0 = Date.now();
		const res = await axios.post(url, encoded, {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			timeout: 15000,
			validateStatus: () => true,
		});
		const dt = Date.now() - t0;
		if (res.status >= 200 && res.status < 300) {
			this.logger.info(`  Token endpoint: HTTP ${res.status} in ${dt}ms (success)`);
			this._logResponseHeaders(res.headers);
			return res.data;
		}
		this.logger.debug(`  Token endpoint: HTTP ${res.status} in ${dt}ms`);
		const err = new Error(`HTTP ${res.status}`);
		err.response = res;
		throw decorateOAuthError(err, 'token', this.logger);
	}

	_logResponseHeaders(headers) {
		if (!headers) return;
		const interesting = ['content-type', 'date', 'x-request-id', 'x-correlation-id', 'retry-after'];
		const lines = [];
		for (const k of interesting) {
			if (headers[k]) lines.push(`${k}=${headers[k]}`);
		}
		if (lines.length) this.logger.info(`  Headers: ${lines.join(' ')}`);
	}
}

/**
 * Home Connect returns OAuth errors as
 *   { "error": "invalid_client", "error_description": "..." }
 * Surface those in the message so the operator can act on it instead of
 * just seeing "Request failed with status code 400".
 */
function decorateOAuthError(e, stage, logger) {
	if (!e || !e.response) return e;
	const data = e.response.data;
	const status = e.response.status;
	const oauthError = data && typeof data === 'object' ? data.error : undefined;
	const oauthDesc = data && typeof data === 'object' ? data.error_description : undefined;
	let detail;
	if (data && typeof data === 'object') {
		detail = [data.error, data.error_description].filter(Boolean).join(': ');
	} else if (typeof data === 'string') {
		detail = data;
	}
	if (logger) {
		logger.error(`HC ${stage} failed: HTTP ${status}`);
		if (oauthError) logger.error(`  error=${oauthError}`);
		if (oauthDesc) logger.error(`  error_description=${oauthDesc}`);
		if (data && typeof data === 'object') {
			const extras = Object.keys(data).filter(k => k !== 'error' && k !== 'error_description');
			if (extras.length) {
				try {
					logger.error(`  body: ${JSON.stringify(data)}`);
				} catch {
					logger.error(`  body keys: ${extras.join(', ')}`);
				}
			}
		} else if (typeof data === 'string' && data.length > 0) {
			logger.error(`  body (text): ${data.length > 500 ? data.slice(0, 500) + '...' : data}`);
		}
	}
	const wrapped = new Error(
		`Home Connect ${stage} failed (HTTP ${status})${detail ? `: ${detail}` : ''}`,
	);
	wrapped.cause = e;
	wrapped.oauthError = oauthError;
	wrapped.oauthErrorDescription = oauthDesc;
	return wrapped;
}

/**
 * Mask a long token / client id for logs: shows first 6 + last 4 chars.
 * Returns '(empty)' if the value is missing.
 */
function mask(value) {
	if (!value) return '(empty)';
	const s = String(value);
	if (s.length <= 12) return s.slice(0, 2) + '***';
	return `${s.slice(0, 6)}…${s.slice(-4)} (len=${s.length})`;
}

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

module.exports = { HomeConnectAuth, HC_BASE };
