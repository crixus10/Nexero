import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { AuthApi } from '../api';
import { clearToken, getToken, setToken } from '../api/client';

const EMAIL_KEY = 'nexero.userEmail';

interface AuthContextValue {
  /** null = neautentificat. Doar prezența tokenului contează pentru rutare — validitatea reală (semnătură, expirare) o verifică API-ul la fiecare request. */
  token: string | null;
  /**
   * Emailul introdus la login — reținut DOAR pentru afișare în UI (header),
   * niciodată folosit pentru autorizare (aia rămâne strict JWT-ul, verificat
   * de API). Nu vine din `/auth/me` (care întoarce doar userId/tenantId,
   * fără email) — dacă backend-ul îl adaugă vreodată, de înlocuit aici.
   */
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [email, setEmailState] = useState<string | null>(() =>
    localStorage.getItem(EMAIL_KEY),
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      email,
      login: async (loginEmail: string, password: string) => {
        const { accessToken } = await AuthApi.login(loginEmail, password);
        setToken(accessToken);
        setTokenState(accessToken);
        localStorage.setItem(EMAIL_KEY, loginEmail);
        setEmailState(loginEmail);
      },
      logout: () => {
        clearToken();
        setTokenState(null);
        localStorage.removeItem(EMAIL_KEY);
        setEmailState(null);
      },
    }),
    [token, email],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() trebuie folosit în interiorul <AuthProvider>.');
  }
  return ctx;
}
