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
 * Fetch with Tor fallback. Direct first → on failure → retry via Tor.
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
  try {
    const res = await fetch(url, {
      ...opts,
      signal: opts.signal ?? AbortSignal.timeout(directTimeout),
    });
    if (!res.ok && BLOCKED_CODES.has(res.status)) {
      throw new Error(`Blocked: HTTP ${res.status}`);
    }
    if (json) {
      const data = await res.json();
      return { ok: true, data };
    }
    return res;
  } catch (directErr) {
    console.log(`[tor] Direct failed → ${directErr.message}`);
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
}

/**
 * Send NEWNYM to Tor control port → forces new circuit (new exit IP).
 * Gracefully degrades if control port unavailable.
 */
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

async function rotateTorCircuit() {
  const controlPort = parseInt(process.env.TOR_CONTROL_PORT || '9051', 10);
  const controlHost = process.env.TOR_CONTROL_HOST || '127.0.0.1';
  const cookie = getTorCookie();

  return new Promise((resolve) => {
    const socket = net.connect(controlPort, controlHost);
    socket.setTimeout(5000);

    socket.on('connect', () => {
      // Auth with cookie hex, or try empty password as fallback
      const auth = cookie
        ? `AUTHENTICATE ${cookie}\r\n`
        : 'AUTHENTICATE ""\r\n';
      socket.write(`${auth}SIGNAL NEWNYM\r\nQUIT\r\n`);
    });
    socket.on('data', () => {}); // 250 OK — ignore
    socket.on('error', () => {
      // Control port not available — skip rotation, still try Tor
    });
    socket.on('close', () => resolve());
    socket.on('timeout', () => {
      socket.destroy();
      resolve();
    });
  });
}
