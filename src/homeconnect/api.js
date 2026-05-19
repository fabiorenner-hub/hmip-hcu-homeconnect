'use strict';

const axios = require('axios');
const { HC_BASE } = require('./auth');

/**
 * Home Connect REST client with built-in rate limit accounting.
 *
 * Quotas tracked (defaults match Home Connect production limits):
 * - 50 requests / minute
 * - 1000 requests / day
 * - On 429, the server-supplied retry-after is honored.
 *
 * Calls are recorded in a ring buffer used by the debug dashboard.
 */
class HomeConnectApi {
	constructor({ auth, state, logger }) {
		this.auth = auth;
		this.state = state;
		this.logger = logger;

		this.callHistory = [];
		this.maxHistory = 100;

		this.minuteWindowStart = Date.now();
		this.minuteCount = 0;
		this.dayWindowStart = Date.now();
		this.dayCount = 0;

		this.maxPerMinute = 49;
		this.maxPerDay = 999;

		this._blockedUntil = 0;
		this._blockReason = null;
	}

	getStats() {
		return {
			minuteWindowStart: this.minuteWindowStart,
			minuteCount: this.minuteCount,
			maxPerMinute: this.maxPerMinute,
			dayWindowStart: this.dayWindowStart,
			dayCount: this.dayCount,
			maxPerDay: this.maxPerDay,
			blockedUntil: this._blockedUntil,
			blockReason: this._blockReason,
			recentCalls: this.callHistory.slice(-this.maxHistory),
		};
	}

	_rotateWindows() {
		const now = Date.now();
		if (now - this.minuteWindowStart >= 60_000) {
			this.minuteWindowStart = now;
			this.minuteCount = 0;
		}
		if (now - this.dayWindowStart >= 24 * 3600_000) {
			this.dayWindowStart = now;
			this.dayCount = 0;
		}
	}

	_checkLimits() {
		this._rotateWindows();
		if (Date.now() < this._blockedUntil) {
			throw new Error(`Rate limit blocked until ${new Date(this._blockedUntil).toISOString()}: ${this._blockReason}`);
		}
		if (this.minuteCount >= this.maxPerMinute) {
			throw new Error('Local minute quota exhausted');
		}
		if (this.dayCount >= this.maxPerDay) {
			throw new Error('Local daily quota exhausted');
		}
	}

	_record(call) {
		this.callHistory.push(call);
		if (this.callHistory.length > this.maxHistory) {
			this.callHistory.shift();
		}
	}

	_authHeaders() {
		const token = this.state.session?.access_token;
		if (!token) {
			throw new Error('No Home Connect access token available');
		}
		return {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.bsh.sdk.v1+json',
			'Accept-Language': this.state.config.language || 'de-DE',
		};
	}

	async _request(method, url, data, { retryOn401 = true } = {}) {
		this._checkLimits();
		this.minuteCount += 1;
		this.dayCount += 1;

		const start = Date.now();
		const fullUrl = url.startsWith('http') ? url : `${HC_BASE}${url}`;
		const call = { ts: new Date().toISOString(), method, url: fullUrl, status: null, durationMs: 0 };

		try {
			const res = await axios({
				method,
				url: fullUrl,
				headers: this._authHeaders(),
				data,
				timeout: 20000,
			});
			call.status = res.status;
			call.durationMs = Date.now() - start;
			this._record(call);
			return res.data;
		} catch (e) {
			call.durationMs = Date.now() - start;
			call.status = e?.response?.status || 'ERR';
			call.error = e?.response?.data?.error?.description || e.message;
			this._record(call);

			if (e?.response?.status === 401 && retryOn401) {
				this.logger.info('Got 401 from Home Connect, refreshing token and retrying once');
				try {
					await this.auth.refresh();
				} catch (re) {
					this.logger.error('Token refresh failed:', re.message);
					throw re;
				}
				return this._request(method, url, data, { retryOn401: false });
			}

			if (e?.response?.status === 429) {
				const retryAfter = parseInt(e.response.headers?.['retry-after'] || '60', 10);
				this._blockedUntil = Date.now() + retryAfter * 1000;
				this._blockReason = '429 from Home Connect';
				this.logger.warn(`Hit Home Connect 429; backing off ${retryAfter}s`);
			}
			throw e;
		}
	}

	async getAppliances() {
		const data = await this._request('GET', '/api/homeappliances');
		return data?.data?.homeappliances || [];
	}

	async getStatus(haId) {
		try {
			const data = await this._request('GET', `/api/homeappliances/${haId}/status`);
			return data?.data?.status || [];
		} catch (e) {
			this.logger.debug(`getStatus(${haId}) failed:`, e.message);
			return [];
		}
	}

	async getSettings(haId) {
		try {
			const data = await this._request('GET', `/api/homeappliances/${haId}/settings`);
			return data?.data?.settings || [];
		} catch (e) {
			this.logger.debug(`getSettings(${haId}) failed:`, e.message);
			return [];
		}
	}

	async putSetting(haId, key, value) {
		const body = { data: { key, value } };
		return this._request('PUT', `/api/homeappliances/${haId}/settings/${key}`, body);
	}

	async putActiveProgram(haId, key, options = []) {
		const body = { data: { key, options } };
		return this._request('PUT', `/api/homeappliances/${haId}/programs/active`, body);
	}

	async stopProgram(haId) {
		return this._request('DELETE', `/api/homeappliances/${haId}/programs/active`);
	}

	async getActiveProgram(haId) {
		try {
			const data = await this._request('GET', `/api/homeappliances/${haId}/programs/active`);
			return data?.data || null;
		} catch (e) {
			this.logger.debug(`getActiveProgram(${haId}) failed:`, e.message);
			return null;
		}
	}

	async getSelectedProgram(haId) {
		try {
			const data = await this._request('GET', `/api/homeappliances/${haId}/programs/selected`);
			return data?.data || null;
		} catch (e) {
			this.logger.debug(`getSelectedProgram(${haId}) failed:`, e.message);
			return null;
		}
	}

	async getAvailablePrograms(haId) {
		try {
			const data = await this._request('GET', `/api/homeappliances/${haId}/programs/available`);
			return data?.data?.programs || [];
		} catch (e) {
			this.logger.debug(`getAvailablePrograms(${haId}) failed:`, e.message);
			return [];
		}
	}

	async raw(method, url, data) {
		return this._request(method, url, data);
	}
}

module.exports = { HomeConnectApi };
