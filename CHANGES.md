# On-Demand Channel Loading Implementation

## Summary
Modified the sync process to skip fetching all channels by default. Now only fetches counts for channels, movies, and series. Users must manually load channels via a button in the source detail screen.

## Changes Made

### 1. Database Migration
**File:** `migrations/1777200000_add_channels_loaded_field.js`
- Added `channels_loaded` boolean field to sources collection
- Tracks whether channels have been loaded on-demand for each source

### 2. Sync Process Changes
**File:** `worker/sync-job.js`
- Modified `syncSource()` to skip channel fetching
- Changed from calling `syncLiveChannels()` to using `timedCount()` for channel count only
- Sets `channels_loaded: false` after sync completes
- Added new `loadChannelsOnDemand()` function that:
  - Fetches live categories
  - Loads all channels via `syncLiveChannels()`
  - Updates `channels_loaded: true` and final channel count

### 3. API Endpoint
**File:** `worker/index.js`
- Imported `loadChannelsOnDemand` from sync-job.js
- Added new POST endpoint `/api/load-channels`
- Handler `handleLoadChannels()`:
  - Accepts `{source_id: "..."}` 
  - Calls `loadChannelsOnDemand()` with progress tracking
  - Returns success response with channel count and progress updates
  - Handles errors gracefully

### 4. Frontend UI
**File:** `frontend/src/routes/SourceDetail.tsx`
- Added `isLoadingChannels` state
- Added `handleLoadChannels()` function that:
  - Calls the new API endpoint
  - Reloads source data and categories after loading
  - Shows success/error alerts
- Added "Load Channels" button next to Sync button:
  - Only shown when `channels_loaded === false` and `channel_count > 0`
  - Disabled while loading
  - Shows spinner during loading
- Updated channel count display:
  - Shows "Not loaded" badge (secondary) when channels not loaded
  - Shows "Loaded" badge (success) when channels loaded

### 5. TypeScript Types
**File:** `frontend/src/types/database.ts`
- Added `channels_loaded: boolean` to Source interface

## Behavior

### Before (Old Behavior)
- Sync process fetched ALL channels, movies, and series
- Slow for large sources with thousands of channels
- Automatic full sync on every update

### After (New Behavior)
- Sync process only fetches:
  - Categories (live, vod, series)
  - Channel count (via lightweight API call)
  - Movie count (via lightweight API call)
  - Series count (via lightweight API call)
- Does NOT fetch individual channel records
- User must click "Load Channels" button to populate channel database
- Button only appears when:
  - Source has been synced (`channel_count > 0`)
  - Channels not yet loaded (`channels_loaded === false`)

## Migration Required
After deploying:
1. Run migration to add `channels_loaded` field
2. Existing sources will have `channels_loaded = false` by default
3. Users can load channels on-demand as needed
4. Next sync will reset `channels_loaded` to false again

## Benefits
- Much faster initial sync (no channel data transfer)
- Reduced database size for users who don't need all channels
- User control over when to load channels
- Better performance for sources with thousands of channels
