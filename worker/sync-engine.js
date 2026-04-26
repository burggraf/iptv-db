import { syncSource } from './sync-job.js';

/**
 * Job queue + worker pool for syncing sources.
 * Manages concurrency, retries, and job tracking.
 */
export class SyncEngine {
  constructor(pb, options = {}) {
    this.pb = pb;
    this.concurrency = options.concurrency || 3;
    this.queue = [];
    this.activeWorkers = 0;
    this.running = new Set();
    this.cancelled = new Set();// Set of sourceIds currently being processed
    this.shuttingDown = false;
  }

  /**
   * Add a source to the sync queue.
   * Deduplicates — won't add if already queued or running.
   */
  enqueue(sourceId) {
    this.cancelled.delete(sourceId);
    if (this.running.has(sourceId)) {
      console.log(`[engine] Source ${sourceId} already being processed, skipping`);
      return;
    }
    if (this.queue.includes(sourceId)) {
      console.log(`[engine] Source ${sourceId} already in queue, skipping`);
      return;
    }
    this.queue.push(sourceId);
    console.log(`[engine] Enqueued source ${sourceId} (queue size: ${this.queue.length})`);
    this.processQueue();
  }

  /**
   * Cancel a running or queued sync for a source.
   */
  cancel(sourceId) {
    const wasRunning = this.running.has(sourceId);

    const queueIndex = this.queue.indexOf(sourceId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      console.log(`[engine] Removed source ${sourceId} from queue`);
    }

    if (wasRunning) {
      this.cancelled.add(sourceId);
      console.log(`[engine] Marked running source ${sourceId} for cancellation`);
    }

    // Always update the latest sync job record, even if the source isn't
    // in our in-memory state (e.g. after a restart, UI shows stale "running").
    return this.cancelSyncJob(sourceId);
  }

  /**
   * Cancel ALL running/queued sync jobs for a source.
   * Important: there can be stale "running" jobs from previous crashed syncs,
   * and the polling UI will find them if we don't cancel them too.
   */
  async cancelSyncJob(sourceId) {
    try {
      const jobs = await this.pb.collection('sync_jobs').getFullList({
        filter: `source_id="${sourceId}" && (status="running" || status="queued")`,
      });
      const finishedAt = new Date().toISOString();
      for (const job of jobs) {
        await this.pb.collection('sync_jobs').update(job.id, {
          status: 'cancelled',
          phase: 'Cancelled by user',
          finished_at: finishedAt,
        });
      }
      console.log(`[engine] Cancelled ${jobs.length} sync job(s) for ${sourceId}`);
    } catch (err) {
      console.error(`[engine] Failed to cancel sync job(s) for ${sourceId}:`, err.message);
    }
  }

  /**
   * Process queued jobs up to concurrency limit.
   */
  async processQueue() {
    while (this.activeWorkers < this.concurrency && this.queue.length > 0) {
      const sourceId = this.queue.shift();
      this.activeWorkers++;
      this.running.add(sourceId);
      await this.createSyncJobRecord(sourceId, 'queued');
      this.processSource(sourceId);
    }
  }

  /**
   * Process a single source with retry logic.
   */
  async processSource(sourceId, attempt = 1) {
    const maxRetries = 3;

    try {
      await this.updateSyncJob(sourceId, { status: 'running', phase: 'Starting sync...', progress: 0 });

      // Pass a cancellation checker to syncSource
      const isCancelled = () => this.cancelled.has(sourceId);
      await syncSource(this.pb, sourceId, (phase, progress) => {
        this.updateSyncJob(sourceId, { phase, progress });
      }, isCancelled);

      // Clear cancellation flag on success
      this.cancelled.delete(sourceId);

      await this.updateSyncJob(sourceId, {
        status: 'completed',
        phase: 'Sync complete',
        progress: 100,
        finished_at: new Date().toISOString(),
      });

      // Update source record
      await this.pb.collection('sources').update(sourceId, {
        last_sync: new Date().toISOString(),
        sync_status: 'ok',
        status: 'active',
      });

      console.log(`[engine] Source ${sourceId} synced successfully`);
    } catch (err) {
      // Handle cancellation — not an error
      if (err && err.code === 'CANCELLED') {
        this.cancelled.delete(sourceId);
        await this.updateSyncJob(sourceId, {
          status: 'cancelled',
          phase: 'Cancelled by user',
          finished_at: new Date().toISOString(),
        });
        console.log(`[engine] Source ${sourceId} cancelled by user`);
        return;
      }

      console.error(`[engine] Source ${sourceId} sync failed (attempt ${attempt}):`, err.message);

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        console.log(`[engine] Retrying in ${delay / 1000}s...`);
        await this.updateSyncJob(sourceId, {
          phase: `Retry ${attempt}/${maxRetries} in ${delay / 1000}s...`,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Don't decrement here — finally block handles it when recursive call returns
        return this.processSource(sourceId, attempt + 1);
      }

      // Mark as failed
      await this.updateSyncJob(sourceId, {
        status: 'failed',
        phase: `Failed after ${maxRetries} attempts`,
        error: err.message,
        finished_at: new Date().toISOString(),
      });

      try {
        await this.pb.collection('sources').update(sourceId, {
          status: 'error',
          sync_status: err.message,
        });
      } catch (updateErr) {
        console.error(`[engine] Failed to update source status to error:`, updateErr.message);
      }

      console.log(`[engine] Source ${sourceId} failed permanently: ${err.message}`);
    } finally {
      if (this.running.has(sourceId)) {
        this.running.delete(sourceId);
      }
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      this.processQueue();
    }
  }

  /**
   * Create or update a sync job record in PocketBase.
   */
  async createSyncJobRecord(sourceId, status) {
    try {
      await this.pb.collection('sync_jobs').create({
        source_id: sourceId,
        status,
        phase: status === 'queued' ? 'Waiting in queue...' : '',
        progress: 0,
        started_at: status === 'queued' ? null : new Date().toISOString(),
      });
    } catch (err) {
      if (err?.isAbort) return; // auto-cancelled, ignore
      console.error('[engine] Failed to create sync job record:', err.message);
    }
  }

  /**
   * Update the most recent sync job for a source.
   * Retries aggressively with backoff to ensure completion updates never fail silently.
   */
  async updateSyncJob(sourceId, updates) {
    for (let attempt = 1; attempt <= 20; attempt++) {
      try {
        const jobs = await this.pb.collection('sync_jobs').getList(1, 1, {
          filter: `source_id="${sourceId}"`,
          sort: '-created',
        });
        if (jobs.items.length > 0) {
          await this.pb.collection('sync_jobs').update(jobs.items[0].id, updates);
        }
        return;
      } catch (err) {
        const isConflict = err?.isAbort || err?.status === 409 || err?.status === 429;
        if (isConflict) {
          const delay = Math.min(300 * attempt, 5000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error(`[engine] Failed to update sync job (attempt ${attempt}):`, err.message);
        if (attempt >= 20) throw err;
      }
    }
  }

  get queueSize() {
    return this.queue.length;
  }

  /**
   * Cancel ALL running and queued sync jobs.
   */
  async cancelAll() {
    console.log(`[engine] Cancelling all sync jobs (queue: ${this.queue.length}, running: ${this.running.size})`);
    this.queue = [];
    const toCancel = [...this.running];
    this.running.clear();
    this.activeWorkers = 0;
    for (const sourceId of toCancel) {
      this.cancelled.add(sourceId);
    }
    await this.cancelSyncJob('*');
  }

  /**
   * Enqueue all sources with a given status filter.
   */
  async enqueueByFilter(filter) {
    const sources = await this.pb.collection('sources').getFullList({
      filter,
      fields: 'id',
    });
    let enqueued = 0;
    for (const s of sources) {
      if (!this.running.has(s.id) && !this.queue.includes(s.id)) {
        this.queue.push(s.id);
        enqueued++;
      }
    }
    console.log(`[engine] Enqueued ${enqueued} sources (queue size: ${this.queue.length})`);
    this.processQueue();
    return enqueued;
  }

  shutdown() {
    this.shuttingDown = true;
    this.queue = [];
  }
}
