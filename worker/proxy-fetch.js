import net from 'net';
import fs from 'fs';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

const TOR_SOCKS = process.env.TOR_SOCKS_URL || 'socks5h://127.0.0.1:9050';
const TOR_TIMEOUT = parseInt(process.env.TOR_TIMEOUT_MS || '30000', 10);
const DIRECT_TIMEOUT = parseInt(process.env.DIRECT_TIMEOUT_MS || '15000', 10);
const BLOCKED_CODES = new Set([403, 429, 503]);

// Network-level errors that commonly indicate IP blocking (not server downtime)
const BLOCKED_ERRS = new Set(['ECONNRESET', 'ECONNREFUSED']);

const torAgent = new SocksProxyAgent(TOR_SOCKS);

/**
 * Determine if a fetch error looks like an IP block vs a genuine server failure.
 * IPTV providers often TCP-reset (ECONNRESET) instead of returning HTTP 403.
 */
function isLikelyIPBlock(err) {
  // Direct error code match
  if (err.code && BLOCKED_ERRS.has(err.code)) return true;
  // Check nested cause (undici wraps errors)
  if (err.cause?.code && BLOCKED_ERRS.has(err.cause.code)) return true;
  // "Failed to fetch" without a clear DNS/timeout reason often means connection-level block
  const msg = err.message || '';
  if (msg.includes('fetch') && !msg.includes('ENOTFOUND') && !msg.includes('Timeout') && !msg.includes('timed out')) return true;
  return false;
}

/**
 * Determine if an error is genuinely unrecoverable (server down, DNS dead).
 * These should NOT trigger Tor fallback.
 */
function isUnrecoverable(err) {
  const msg = err.message || '';
  const code = err.code || err.cause?.code;
  if (code === 'ENOTFOUND') return true;
  if (msg.includes('ENOTFOUND')) return true;
  if (code === 'ETIMEDOUT' || msg.includes('timed out') || msg.includes('Timeout')) return true;
  return false;
}

/**
 * Fetch with Tor fallback. Direct first → on block → retry via Tor.
 *
 * Handles both HTTP-level blocks (403/429/503) and network-level blocks
 * (ECONNRESET, ECONNREFUSED — common for IPTV providers).
 *
 * Genuine server failures (DNS dead, server offline) are NOT retried.
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
    const looksBlocked = isLikelyIPBlock(err);
    const isDead = isUnrecoverable(err);

    if (isDead) {
      console.log(`[tor] Direct failed → ${err.message} (unrecoverable, not retrying)`);
      throw directErr;
    }

    if (looksBlocked) {
      console.log(`[tor] Direct failed → ${err.message} (likely IP block, trying Tor)`);
      isBlocked = true;
    } else {
      console.log(`[tor] Direct failed → ${err.message} (unknown error, trying Tor)`);
      isBlocked = true;
    }
  }

  // ── Attempt 2: Via Tor ──
  if (rotateCircuit) {
    await rotateTorCircuit();
  }
  if (onTorFallback) {
    onTorFallback();
  }

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
    // Throw original error — it's more accurate (Tor exit may also be blocked)
    throw directErr;
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
