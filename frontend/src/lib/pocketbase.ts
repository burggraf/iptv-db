import PocketBase from 'pocketbase';

// Use relative path so requests go through nginx (same origin)
const PB_URL = '/';

export const pb = new PocketBase(PB_URL);

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
