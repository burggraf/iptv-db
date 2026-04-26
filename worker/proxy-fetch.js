import net from 'net';
import fs from 'fs';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

const TOR_SOCKS = process.env.TOR_SOCKS_URL || 'socks5h://127.0.0.1:9050';
const TOR_TIMEOUT = parseInt(process.env.TOR_TIMEOUT_MS || '30000', 10);
const DIRECT_TIMEOUT = parseInt(process.env.DIRECT_TIMEOUT_MS || '15000', 10);
const BLOCKED_CODES = new Set([403, 429, 503]);

const torAgent = new SocksProxyAgent(TOR_SOCKS);

/**
 * Fetch with Tor fallback. Direct first → on HTTP block (403/429/503) → retry via Tor.
 *
 * Network errors (DNS failure, ECONNRESET, timeout) are NOT retried via Tor —
 * Tor cannot fix a domain that doesn't resolve or a server that's down.
 *
 * @param {string} url
 * @param {object} opts - Standard fetch options (headers, method, body, etc.)
 * @param {object} torOpts
 * @param {function} [torOpts.onTorFallback] - Called when Tor kicks in
 * @param {boolean} [torOpts.rotateCircuit=true] - Send NEWNYM before Tor retry
 * @param {number} [torOpts.directTimeout] - Direct fetch timeout ms
 * @param {number} [torOpts.torTimeout] - Tor fetch timeout ms
 * @param {boolean} [torOpts.json] - If true, parse body as JSON and return { ok, data }
 * @returns {Promise<import('node-fetch').Response|{ok:boolean,data:any}>}
 */
export async function fetchWithTorFallback(url, opts = {}, torOpts = {}) {
  const {
    onTorFallback,
    rotateCircuit = true,
    directTimeout = DIRECT_TIMEOUT,
    torTimeout = TOR_TIMEOUT,
    json = false,
  } = torOpts;

  // ── Attempt 1: Direct ──
  let isBlocked = false;
  let directErr;
  try {
    const res = await fetch(url, {
      ...opts,
      signal: opts.signal ?? AbortSignal.timeout(directTimeout),
    });
    if (!res.ok && BLOCKED_CODES.has(res.status)) {
      isBlocked = true;
      throw new Error(`Blocked: HTTP ${res.status}`);
    }
    if (json) {
      const data = await res.json();
      return { ok: true, data };
    }
    return res;
  } catch (err) {
    directErr = err;
    console.log(`[tor] Direct failed → ${err.message}${isBlocked ? ' (BLOCKED)' : ''}`);
  }

  // ── Only fall back to Tor for HTTP block errors ──
  // DNS failures, ECONNRESET, timeouts, etc. won't be fixed by Tor
  if (!isBlocked) {
    throw directErr;
  }

  // ── Optional: Rotate Tor circuit before retry ──
  if (rotateCircuit) {
    await rotateTorCircuit();
  }

  // ── Notify caller (dashboard phase update) ──
  if (onTorFallback) {
    onTorFallback();
  }

  // ── Attempt 2: Via Tor ──
  try {
    const torRes = await fetch(url, {
      ...opts,
      agent: torAgent,
      signal: opts.signal ?? AbortSignal.timeout(torTimeout),
    });

    if (json) {
      if (!torRes.ok) {
        throw new Error(`Tor fetch failed: HTTP ${torRes.status} ${torRes.statusText}`);
      }
      const data = await torRes.json();
      return { ok: true, data };
    }

    if (!torRes.ok) {
      throw new Error(`Tor fetch failed: HTTP ${torRes.status} ${torRes.statusText}`);
    }

    return torRes;
  } catch (torErr) {
    console.log(`[tor] Tor fallback also failed → ${torErr.message}`);
    throw torErr;
  }
}

/**
 * Read Tor control cookie and return hex-encoded auth string.
 */
function getTorCookie() {
  const cookiePath = process.env.TOR_COOKIE_PATH || '/var/run/tor/control.authcookie';
  try {
    return fs.readFileSync(cookiePath).toString('hex');
  } catch {
    return null;
  }
}

/**
 * Send NEWNYM to Tor control port → forces new circuit (new exit IP).
 * Gracefully degrades if control port unavailable.
 */
async function rotateTorCircuit() {
  const controlPort = parseInt(process.env.TOR_CONTROL_PORT || '9051', 10);
  const controlHost = process.env.TOR_CONTROL_HOST || '127.0.0.1';
  const cookie = getTorCookie();

  return new Promise((resolve) => {
    const socket = net.connect(controlPort, controlHost);
    socket.setTimeout(5000);

    socket.on('connect', () => {
      const auth = cookie
        ? `AUTHENTICATE ${cookie}\r\n`
        : 'AUTHENTICATE ""\r\n';
      socket.write(`${auth}SIGNAL NEWNYM\r\nQUIT\r\n`);
    });
    socket.on('data', () => {});
    socket.on('error', () => {});
    socket.on('close', () => resolve());
    socket.on('timeout', () => {
      socket.destroy();
      resolve();
    });
  });
}
