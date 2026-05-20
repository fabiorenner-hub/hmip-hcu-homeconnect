'use strict';

// `eventsource` 2.x exports the constructor as the CommonJS default
// (i.e. `module.exports = EventSource`), so destructuring fails:
//   const { EventSource } = require('eventsource'); // -> undefined
// Use the default export directly.
const EventSource = require('eventsource');
const { HC_BASE } = require('./auth');

/**
 * Subscribes to the Home Connect SSE event stream and dispatches
 * events to user-supplied handlers.
 *
 * Event types delivered:
 *   STATUS, NOTIFY, EVENT, CONNECTED, DISCONNECTED, PAIRED, DEPAIRED, KEEP-ALIVE
 */
class HomeConnectEvents {
	constructor({ state, logger, onEvent }) {
		this.state = state;
		this.logger = logger;
		this.onEvent = onEvent;
		this.es = null;
		this.keepAliveTimer = null;
		this._stopped = false;
		this.history = [];
		this.maxHistory = 200;
		this.stats = { received: 0, lastEventAt: null };
	}

	getHistory() { return this.history.slice(); }
	getStats() { return { ...this.stats, connected: !!this.es }; }

	start() {
		this._stopped = false;
		this._connect();
	}

	stop() {
		this._stopped = true;
		this._disconnect();
	}

	_disconnect() {
		if (this.keepAliveTimer) {
			clearInterval(this.keepAliveTimer);
			this.keepAliveTimer = null;
		}
		if (this.es) {
			try { this.es.close(); } catch { /* ignore */ }
			this.es = null;
		}
	}

	_connect() {
		this._disconnect();

		const token = this.state.session?.access_token;
		if (!token) {
			this.logger.warn('Cannot start event stream without access token');
			return;
		}

		const url = `${HC_BASE}/api/homeappliances/events`;
		this.logger.debug('Connecting to Home Connect event stream');
		this.es = new EventSource(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'text/event-stream',
			},
		});

		this.es.onerror = err => {
			this.logger.warn('SSE error:', err?.message || JSON.stringify(err));
			if (err?.code === 401) {
				// caller should refresh token + restart
				this._dispatch({ type: 'AUTH_FAILED' });
			}
		};

		const types = ['PAIRED', 'DEPAIRED', 'STATUS', 'NOTIFY', 'EVENT', 'CONNECTED', 'DISCONNECTED'];
		for (const t of types) {
			this.es.addEventListener(t, e => this._handle(t, e));
		}
		this.es.addEventListener('KEEP-ALIVE', () => this._resetKeepAlive());

		this._resetKeepAlive();
	}

	_handle(type, e) {
		this._resetKeepAlive();
		let payload = null;
		if (e.data) {
			try { payload = JSON.parse(e.data); } catch { payload = e.data; }
		}
		const haId = (e.lastEventId || payload?.haId || '').replace(/-001$/, '');
		this.stats.received += 1;
		this.stats.lastEventAt = new Date().toISOString();
		this.history.push({ ts: this.stats.lastEventAt, type, haId, payload });
		if (this.history.length > this.maxHistory) this.history.shift();
		this._dispatch({ type, haId, payload });
	}

	_dispatch(evt) {
		try { this.onEvent && this.onEvent(evt); }
		catch (e) { this.logger.error('Event handler threw:', e); }
	}

	_resetKeepAlive() {
		if (this.keepAliveTimer) {
			clearInterval(this.keepAliveTimer);
		}
		this.keepAliveTimer = setInterval(() => {
			this.logger.warn('Event stream keep-alive missed, reconnecting');
			if (!this._stopped) {
				this._connect();
			}
		}, 70_000);
	}
}

module.exports = { HomeConnectEvents };
