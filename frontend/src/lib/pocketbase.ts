import PocketBase from 'pocketbase';

// Auto-detect API URL based on environment
const PB_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);

// Auth helper
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
