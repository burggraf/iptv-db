import type PocketBase from 'pocketbase';

// Auto-generated types matching PocketBase collections
export type RecordModel = PocketBase.Record;

export interface Source extends RecordModel {
  type: 'xtream' | 'm3u';
  name: string;
  base_url: string;
  username: string;
  password: string;
  m3u_url: string;
  max_connections: number;
  expiry_date: string;
  status: 'active' | 'expired' | 'error' | 'pending';
  last_sync: string;
  sync_status: string;
  source_url: string;
  scraped_at: string;
  channel_count: number;
  movie_count: number;
  series_count: number;
}

export interface Category extends RecordModel {
  source_id: string;
  type: 'live' | 'vod' | 'series';
  category_id: number;
  name: string;
}

export interface Channel extends RecordModel {
  source_id: string;
  category_id: string;
  stream_id: number;
  name: string;
  logo: string;
  epg_id: string;
  tvg_id: string;
  tvg_country: string;
  added: string;
  available: boolean;
}

export interface Movie extends RecordModel {
  source_id: string;
  category_id: string;
  stream_id: number;
  name: string;
  plot: string;
  year: string;
  genre: string;
  rating: number;
  poster: string;
  backdrop: string;
  director: string;
  cast: string;
  duration_secs: number;
  release_date: string;
  youtube_trailer: string;
  episode_run_time: string;
  available: boolean;
}

export interface Series extends RecordModel {
  source_id: string;
  category_id: string;
  series_id: number;
  name: string;
  plot: string;
  year: string;
  genre: string;
  rating: number;
  poster: string;
  backdrop: string;
  cast: string;
  director: string;
  available: boolean;
}

export interface SeriesEpisode extends RecordModel {
  series_id: string;
  season: number;
  episode_num: number;
  title: string;
  plot: string;
  duration_secs: number;
  poster: string;
  added: string;
  available: boolean;
}

export interface SyncJob extends RecordModel {
  source_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: string;
  progress: number;
  started_at: string;
  finished_at: string;
  error: string;
}

// Expanded types with relation data (PocketBase expand)
export interface ChannelExpanded extends Channel {
  expand?: {
    source_id: Source;
    category_id: Category;
  };
}

export interface MovieExpanded extends Movie {
  expand?: {
    source_id: Source;
    category_id: Category;
  };
}

export interface SeriesExpanded extends Series {
  expand?: {
    source_id: Source;
    category_id: Category;
  };
}

export interface CategoryExpanded extends Category {
  expand?: {
    source_id: Source;
  };
}

export interface SyncJobExpanded extends SyncJob {
  expand?: {
    source_id: Source;
  };
}

export interface M3UPlaylist extends RecordModel {
  name: string;
  slug: string;
  source_id: string;
  include_live: boolean;
  include_vod: boolean;
  include_series: boolean;
  created_by_user_id: string;
}

// Source with counts (computed by dashboard)
export interface SourceWithCounts extends Source {
  channel_count?: number;
  movie_count?: number;
  series_count?: number;
}
