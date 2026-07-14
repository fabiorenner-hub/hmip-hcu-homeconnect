'use strict';

const { GITHUB_REPO } = require('../pluginMeta');

const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`;

/**
 * @typedef {Object} ReleaseAsset  { name, url }
 * @typedef {Object} LatestRelease { tagName, htmlUrl, assets, prerelease }
 */

function parseRelease(j) {
	if (j === null || typeof j !== 'object') return null;
	const o = j;
	const tagName = typeof o.tag_name === 'string' ? o.tag_name : null;
	if (tagName === null) return null;
	const htmlUrl = typeof o.html_url === 'string'
		? o.html_url
		: `https://github.com/${GITHUB_REPO}/releases`;
	const prerelease = o.prerelease === true;
	const assets = [];
	for (const a of Array.isArray(o.assets) ? o.assets : []) {
		const name = a && typeof a.name === 'string' ? a.name : null;
		const url = a && typeof a.browser_download_url === 'string' ? a.browser_download_url : null;
		if (name && url && url.startsWith('https://')) assets.push({ name, url });
	}
	return { tagName, htmlUrl, assets, prerelease };
}

async function getJson(fetchImpl, url) {
	try {
		const r = await fetchImpl(url, {
			headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'hcu-ota' },
		});
		if (!r.ok) return null;
		return await r.json();
	} catch {
		return null;
	}
}

async function fetchLatestRelease(fetchImpl) {
	const j = await getJson(fetchImpl, LATEST_RELEASE_API);
	return j ? parseRelease(j) : null;
}

async function fetchLatestPrerelease(fetchImpl) {
	const j = await getJson(fetchImpl, RELEASES_API);
	if (!Array.isArray(j)) return null;
	for (const item of j) {
		const rel = parseRelease(item);
		if (rel && rel.prerelease) return rel;
	}
	return null;
}

function findOtaAssets(rel) {
	let manifest = null;
	let bundle = null;
	let sha256 = null;
	for (const a of rel.assets) {
		const n = a.name.toLowerCase();
		if (/^ota-manifest.*\.json$/u.test(n)) manifest = a;
		else if (n.endsWith('.sha256')) sha256 = a;
		else if (/^.*-ota-.*\.json$/u.test(n)) bundle = a;
	}
	return { manifest, bundle, sha256 };
}

module.exports = {
	LATEST_RELEASE_API,
	RELEASES_API,
	parseRelease,
	fetchLatestRelease,
	fetchLatestPrerelease,
	findOtaAssets,
};
