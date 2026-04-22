/**
 * Parse an M3U/M3U8 playlist file into channel entries.
 * Returns structured channel data with metadata.
 */
export function parseM3u(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      current = parseExtinf(line);
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}

/**
 * Parse an #EXTINF line into structured metadata.
 * Example: #EXTINF:-1 tvg-id="BBC1.uk" tvg-name="BBC One" tvg-logo="http://..." group-title="UK",BBC One HD
 */
function parseExtinf(line) {
  const entry = {
    duration: -1,
    name: '',
    tvgId: '',
    tvgName: '',
    tvgLogo: '',
    groupTitle: '',
    tvgCountry: '',
    url: '',
  };

  // Parse duration
  const durationMatch = line.match(/#EXTINF:\s*(-?\d+)/);
  if (durationMatch) {
    entry.duration = parseInt(durationMatch[1], 10);
  }

  // Parse key-value attributes
  const attrs = line.match(/(\w[\w-]+)="([^"]*)"/g);
  if (attrs) {
    for (const attr of attrs) {
      const [, key, value] = attr.match(/(\w[\w-]+)="([^"]*)"/);
      const normalized = key.toLowerCase().replace(/-/g, '');
      switch (normalized) {
        case 'tvgid': entry.tvgId = value; break;
        case 'tvgname': entry.tvgName = value; break;
        case 'tvglogo': entry.tvgLogo = value; break;
        case 'grouptitle': entry.groupTitle = value; break;
        case 'tvgcountry': entry.tvgCountry = value; break;
      }
    }
  }

  // Channel name is after the last comma
  const commaIdx = line.lastIndexOf(',');
  if (commaIdx !== -1) {
    entry.name = line.substring(commaIdx + 1).trim();
  }

  // Fallback name
  if (!entry.name) {
    entry.name = entry.tvgName || entry.tvgId || 'Unknown';
  }

  return entry;
}

/**
 * Parse an M3U URL to extract server, username, and password.
 * Returns null if not a valid Xtream M3U URL.
 * Example: http://server:8080/get.php?username=user&password=pass&type=m3u
 */
export function parseM3uUrl(url) {
  try {
    const parsed = new URL(url);
    const username = parsed.searchParams.get('username');
    const password = parsed.searchParams.get('password');

    if (!username || !password) return null;

    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    return { baseUrl, username, password };
  } catch {
    return null;
  }
}
