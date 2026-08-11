import { Navigate, useLocation } from 'react-router-dom';
import { isAuthed } from '../lib/auth';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!isAuthed()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
