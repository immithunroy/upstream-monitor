import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { isAuthed, logout } from '../lib/auth';
import GlobalSearch from './GlobalSearch';
import ThemeToggle from './ThemeToggle';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/reports', label: 'Reports' },
  { to: '/changes', label: 'Changes' },
];

const adminLinks = [{ to: '/destinations', label: 'Destinations' }];

export default function Layout() {
  const navigate = useNavigate();
  const authed = isAuthed();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-edge bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Upstream Monitor" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-sm font-semibold leading-tight tracking-tight text-tx">
              Upstream
              <br />
              Monitor
            </span>
          </NavLink>

          <nav className="flex flex-wrap items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-white'
                      : 'text-tx2 hover:bg-edge/60 hover:text-tx'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <span className="mx-1 h-5 w-px bg-edge" />
            {adminLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-white'
                      : `text-tx2 hover:bg-edge/60 hover:text-tx ${authed ? '' : 'opacity-50'}`
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <ThemeToggle />
            {authed ? (
              <button
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-tx3 hover:bg-edge/60 hover:text-tx"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Logout
              </button>
            ) : (
              <NavLink
                to="/login"
                className="rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-tx2 hover:bg-edge/60"
              >
                Admin
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
