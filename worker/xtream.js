const TIMEOUT_CONNECT = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
const TIMEOUT_READ = parseInt(process.env.READ_TIMEOUT_MS || '60000', 10);

/**
 * Xtream Codes API client.
 * Wraps all API calls with error handling and timeouts.
 */
export class XtreamClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
  }

  /**
   * Make an API request with timeout and error handling.
   */
  async request(action, params = {}) {
    const url = new URL(`${this.baseUrl}/player_api.php`);
    url.searchParams.set('username', this.username);
    url.searchParams.set('password', this.password);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), TIMEOUT_CONNECT);

    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
      });
      clearTimeout(connectTimeout);

      // Set read timeout
      const readTimeout = setTimeout(() => controller.abort(), TIMEOUT_READ);

      try {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        clearTimeout(readTimeout);
        return data;
      } catch (err) {
        clearTimeout(readTimeout);
        throw err;
      }
    } catch (err) {
      clearTimeout(connectTimeout);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${TIMEOUT_CONNECT / 1000}s`);
      }
      throw err;
    }
  }

  /**
   * Authenticate and get user account info.
   */
  async getUserInfo() {
    const data = await this.request('');
    if (data.user_info) {
      return {
        status: data.user_info.status,
        expiry: data.user_info.exp_date
          ? new Date(parseInt(data.user_info.exp_date) * 1000).toISOString()
          : null,
        maxConnections: parseInt(data.user_info.max_connections || '1', 10),
        activeConnections: parseInt(data.user_info.active_cons || '0', 10),
        allowedOutput: data.user_info.allowed_output_formats,
        message: data.user_info.message,
        auth: data.user_info.auth,
      };
    }
    // Some servers return auth info at top level
    if (data.auth && data.auth.status === 1) {
      return {
        status: 'Active',
        expiry: data.auth.exp_date
          ? new Date(parseInt(data.auth.exp_date) * 1000).toISOString()
          : null,
        maxConnections: parseInt(data.auth.max_connections || '1', 10),
        activeConnections: 0,
        message: '',
      };
    }
    throw new Error('Invalid API response: no user_info found');
  }

  /**
   * Get live categories.
   */
  async getLiveCategories() {
    const data = await this.request('get_live_categories');
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get VOD categories.
   */
  async getVodCategories() {
    const data = await this.request('get_vod_categories');
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get series categories.
   */
  async getSeriesCategories() {
    const data = await this.request('get_series_categories');
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get live streams (optionally by category).
   */
  async getLiveStreams(categoryId = null) {
    const params = categoryId ? { category_id: String(categoryId) } : {};
    const data = await this.request('get_live_streams', params);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get VOD streams (optionally by category).
   */
  async getVodStreams(categoryId = null) {
    const params = categoryId ? { category_id: String(categoryId) } : {};
    const data = await this.request('get_vod_streams', params);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get series (optionally by category).
   */
  async getSeries(categoryId = null) {
    const params = categoryId ? { category_id: String(categoryId) } : {};
    const data = await this.request('get_series', params);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get full series info including episodes.
   */
  async getSeriesInfo(seriesId) {
    const data = await this.request('get_series_info', { series_id: String(seriesId) });
    return data;
  }

  /**
   * Get short VOD info (metadata).
   */
  async getVodInfo(streamId) {
    const data = await this.request('get_vod_info', { vod_id: String(streamId) });
    return data;
  }

  /**
   * Get full live streams list with category grouping.
   * Falls back to per-category fetching if full list fails.
   */
  async getAllLiveStreams() {
    try {
      const streams = await this.getLiveStreams();
      if (streams.length > 0) return streams;
    } catch {
      // Fall through to per-category fetch
    }
    return [];
  }

  /**
   * Build stream URL for a live channel.
   */
  buildLiveUrl(streamId, extension = 'm3u8') {
    return `${this.baseUrl}/live/${this.username}/${this.password}/${streamId}.${extension}`;
  }

  /**
   * Build stream URL for a movie.
   */
  buildMovieUrl(streamId, extension = 'mp4') {
    return `${this.baseUrl}/movie/${this.username}/${this.password}/${streamId}.${extension}`;
  }

  /**
   * Build stream URL for a series episode.
   */
  buildSeriesUrl(streamId, extension = 'mp4') {
    return `${this.baseUrl}/series/${this.username}/${this.password}/${streamId}.${extension}`;
  }
}
