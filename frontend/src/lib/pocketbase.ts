import PocketBase from 'pocketbase';
import type { ClientResponseError } from 'pocketbase';

// Use relative path so requests go through nginx (same origin)
const PB_URL = '/';

export const pb = new PocketBase(PB_URL);

// Disable auto-cancellation: we use manual `cancelled` flags in useEffect cleanup
// to handle stale responses. Auto-cancellation causes false error logs when
// rapid realtime events or filter changes trigger duplicate requests.
pb.autoCancellation(false);

/**
 * Check if a caught error is a PocketBase abort/cancellation error.
 * These should be silently ignored — they happen when a request is
 * superseded by a newer one (e.g., rapid filter changes, realtime updates).
 */
export function isAbortError(err: unknown): boolean {
  const e = err as ClientResponseError | undefined;
  return e?.isAbort === true;
}

export function isAuthenticated(): boolean {
  return pb.authStore.isValid;
}

export function currentUser() {
  return pb.authStore.model;
}

export async function login(email: string, password: string) {
  const authData = await pb.collection('users').authWithPassword(email, password);
  return authData;
}

export function logout() {
  pb.authStore.clear();
}

/**
 * Safe wrapper for PocketBase calls that silently ignores abort errors.
 * Use this in realtime callbacks and other places where request cancellation
 * is expected behavior.
 */
export async function pbCall<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (isAbortError(err)) return undefined;
    throw err;
  }
}
