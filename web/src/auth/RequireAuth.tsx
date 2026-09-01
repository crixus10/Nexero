import { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Route guard client-side — NU o măsură de securitate (aia e API-ul, per JwtAuthGuard). Doar UX: evită să afișeze un ecran care oricum ar da 401. */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
