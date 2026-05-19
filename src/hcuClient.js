'use strict';

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

/**
 * WebSocket client speaking the Homematic IP Connect API.
 *
 * The HCU pushes requests (PLUGIN_STATE_REQUEST, DISCOVER_REQUEST,
 * CONFIG_TEMPLATE_REQUEST, CONFIG_UPDATE_REQUEST, CONTROL_REQUEST,
 * LIST_USER_MESSAGES_RESPONSE...) and we send the matching responses
 * plus our own STATUS_EVENT and CREATE_USER_MESSAGE_REQUEST messages.
 */
class HcuClient {
	constructor({ pluginId, host, tokenFile, logger, handlers }) {
		this.pluginId = pluginId;
		this.host = host;
		this.tokenFile = tokenFile;
		this.logger = logger;
		this.handlers = handlers || {};
		this.ws = null;
		this.connected = false;
		this.reconnectTimer = null;
		this.reconnectDelayMs = 5000;
		this._stopped = false;
		this.history = []; // ring buffer of last N envelopes
		this.maxHistory = 200;
		this.stats = { sent: 0, received: 0, connectsTotal: 0 };
	}

	async start() {
		this._stopped = false;
		await this._connect();
	}

	stop() {
		this._stopped = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.ws) {
			try { this.ws.close(); } catch { /* ignore */ }
		}
	}

	async _connect() {
		let authtoken = '';
		try {
			authtoken = (await fs.readFile(this.tokenFile, 'utf8')).trim();
		} catch (e) {
			this.logger.error(`Cannot read auth token from ${this.tokenFile}: ${e.message}`);
			this._scheduleReconnect();
			return;
		}

		const url = `wss://${this.host}:9001`;
		this.logger.info(`Connecting to HCU at ${url}`);
		this.ws = new WebSocket(url, {
			rejectUnauthorized: false,
			headers: {
				authtoken,
				'plugin-id': this.pluginId,
			},
		});

		this.ws.on('open', () => {
			this.connected = true;
			this.stats.connectsTotal += 1;
			this.logger.info('HCU WebSocket connected');
			this.sendPluginReady('READY');
			if (this.handlers.onConnected) this.handlers.onConnected();
		});

		this.ws.on('message', data => this._onMessage(data));

		this.ws.on('close', (code, reason) => {
			this.connected = false;
			this.logger.warn(`HCU WebSocket closed: ${code} ${reason || ''}`);
			if (this.handlers.onDisconnected) this.handlers.onDisconnected();
			this._scheduleReconnect();
		});

		this.ws.on('error', err => {
			this.logger.error('HCU WebSocket error:', err.code || err.message);
		});
	}

	_scheduleReconnect() {
		if (this._stopped) return;
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this._connect().catch(e => this.logger.error('Reconnect failed:', e.message));
		}, this.reconnectDelayMs);
	}

	_onMessage(raw) {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch (e) {
			this.logger.warn('Failed to parse HCU message:', e.message);
			return;
		}
		this.stats.received += 1;
		this._record('in', msg);
		this.logger.debug('<- HCU', msg.type, msg.id);

		switch (msg.type) {
			case 'PLUGIN_STATE_REQUEST':
				this._safe('onPluginStateRequest', msg);
				break;
			case 'DISCOVER_REQUEST':
				this._safe('onDiscoverRequest', msg);
				break;
			case 'CONFIG_TEMPLATE_REQUEST':
				this._safe('onConfigTemplateRequest', msg);
				break;
			case 'CONFIG_UPDATE_REQUEST':
				this._safe('onConfigUpdateRequest', msg);
				break;
			case 'CONTROL_REQUEST':
				this._safe('onControlRequest', msg);
				break;
			case 'CREATE_USER_MESSAGE_RESPONSE':
			case 'DELETE_USER_MESSAGE_RESPONSE':
			case 'LIST_USER_MESSAGES_RESPONSE':
			case 'HMIP_SYSTEM_RESPONSE':
				this._safe('onResponse', msg);
				break;
			case 'HMIP_SYSTEM_EVENT':
				this._safe('onSystemEvent', msg);
				break;
			default:
				this.logger.debug('Unhandled HCU message type:', msg.type);
		}
	}

	_safe(name, msg) {
		const fn = this.handlers[name];
		if (!fn) return;
		Promise.resolve()
			.then(() => fn(msg))
			.catch(e => this.logger.error(`Handler ${name} failed:`, e));
	}

	send(envelope) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.logger.warn('Cannot send, WebSocket not open:', envelope?.type);
			return false;
		}
		const out = {
			pluginId: this.pluginId,
			id: envelope.id || uuidv4(),
			...envelope,
		};
		this.ws.send(JSON.stringify(out));
		this.stats.sent += 1;
		this._record('out', out);
		this.logger.debug('-> HCU', out.type, out.id);
		return true;
	}

	_record(direction, msg) {
		this.history.push({ ts: new Date().toISOString(), direction, type: msg.type, id: msg.id, body: msg.body });
		if (this.history.length > this.maxHistory) {
			this.history.shift();
		}
	}

	getHistory() {
		return this.history.slice();
	}

	sendPluginReady(status, replyTo) {
		return this.send({
			id: replyTo,
			type: 'PLUGIN_STATE_RESPONSE',
			body: { pluginReadinessStatus: status },
		});
	}

	sendDiscoverResponse(replyTo, devices) {
		return this.send({
			id: replyTo,
			type: 'DISCOVER_RESPONSE',
			body: { success: true, devices },
		});
	}

	sendConfigTemplate(replyTo, body) {
		return this.send({
			id: replyTo,
			type: 'CONFIG_TEMPLATE_RESPONSE',
			body,
		});
	}

	sendConfigUpdateResponse(replyTo, status, message) {
		return this.send({
			id: replyTo,
			type: 'CONFIG_UPDATE_RESPONSE',
			body: { status, ...(message ? { message } : {}) },
		});
	}

	sendControlResponse(replyTo, deviceId, success, error) {
		return this.send({
			id: replyTo,
			type: 'CONTROL_RESPONSE',
			body: { deviceId, success, ...(error ? { error } : {}) },
		});
	}

	sendStatusEvent(deviceId, features) {
		return this.send({
			type: 'STATUS_EVENT',
			body: { deviceId, features },
		});
	}

	sendUserMessage({ messageCategory = 'INFO', userMessageId, title, message, behaviorType = 'DISMISSIBLE' }) {
		return this.send({
			type: 'CREATE_USER_MESSAGE_REQUEST',
			body: {
				messageCategory,
				userMessageId,
				title,
				message,
				behaviorType,
				timestamp: Date.now(),
			},
		});
	}

	deleteUserMessage(userMessageId) {
		return this.send({
			type: 'DELETE_USER_MESSAGE_REQUEST',
			body: { userMessageId },
		});
	}
}

module.exports = { HcuClient };
