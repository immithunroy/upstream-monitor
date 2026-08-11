const TOKEN_KEY = 'upstream_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isAuthed(): boolean {
  return Boolean(getToken());
}

export function logout(): void {
  setToken(null);
}
