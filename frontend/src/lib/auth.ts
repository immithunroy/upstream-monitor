const TOKEN_KEY = 'upstream_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Token expiry (ms) from its payload, or null when unreadable. */
export function tokenExpiry(token: string): number | null {
  try {
    const body = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(body)).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Signed in = a token that has not expired (an expired one used to keep the
 *  admin UI visible while every action failed with 401). */
export function isAuthed(): boolean {
  const token = getToken();
  if (!token) return false;
  const exp = tokenExpiry(token);
  if (exp !== null && exp <= Date.now()) {
    setToken(null);
    return false;
  }
  return true;
}

export function logout(): void {
  setToken(null);
}
