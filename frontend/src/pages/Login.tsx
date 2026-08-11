import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { isAuthed, setToken } from '../lib/auth';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/destinations';

  if (isAuthed()) return <Navigate to={from} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.login(password);
      setToken(res.token);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <img src="/logo.png" alt="Upstream Monitor" className="h-10 w-10 rounded-xl object-contain" />
          <div>
            <h1 className="text-lg font-semibold text-tx">Admin login</h1>
            <p className="text-xs text-tx3">Upstream Monitor</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Admin password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {error && <div className="text-sm text-red-600 dark:text-red-300">{error}</div>}
          <button className="btn-primary w-full justify-center" disabled={busy || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
