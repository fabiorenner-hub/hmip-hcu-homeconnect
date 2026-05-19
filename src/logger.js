'use strict';

/**
 * Lightweight logger with a ring buffer so the debug dashboard can render
 * the last N log lines without a heavy logging dependency.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

class Logger {
	constructor({ bufferSize = 500, level = 'info' } = {}) {
		this.bufferSize = bufferSize;
		this.level = level;
		this.buffer = [];
		this.listeners = new Set();
	}

	setLevel(level) {
		if (LEVELS[level] != null) {
			this.level = level;
		}
	}

	_write(level, args) {
		if (LEVELS[level] < LEVELS[this.level]) {
			return;
		}
		const ts = new Date().toISOString();
		const text = args
			.map(a => {
				if (a instanceof Error) {
					return `${a.message}\n${a.stack || ''}`;
				}
				if (typeof a === 'object' && a !== null) {
					try {
						return JSON.stringify(a);
					} catch {
						return String(a);
					}
				}
				return String(a);
			})
			.join(' ');

		const entry = { ts, level, text };
		this.buffer.push(entry);
		if (this.buffer.length > this.bufferSize) {
			this.buffer.shift();
		}

		const line = `[${ts}] [${level.toUpperCase()}] ${text}`;
		const target = level === 'error' || level === 'warn' ? console.error : console.log;
		target(line);

		for (const fn of this.listeners) {
			try { fn(entry); } catch { /* ignore */ }
		}
	}

	debug(...args) { this._write('debug', args); }
	info(...args) { this._write('info', args); }
	warn(...args) { this._write('warn', args); }
	error(...args) { this._write('error', args); }

	tail(n = 200) {
		return this.buffer.slice(-n);
	}

	subscribe(fn) {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}
}

module.exports = { Logger };
