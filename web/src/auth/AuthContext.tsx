import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthApi } from '../api';
import { clearToken, getToken, setToken } from '../api/client';

const EMAIL_KEY = 'nexero.userEmail';
const TENANT_NAME_KEY = 'nexero.tenantName';

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
  /**
   * Numele firmei active (tenant curent) — afișat în header („firma la
   * care sunt conectat"). Spre deosebire de `email`, ăsta CHIAR vine de la
   * API (GET /auth/me, câmp derivat din DB, nu introdus de user) — cache-uit
   * în localStorage doar ca să evite un flash de „gol" la reload, refăcut
   * mereu după login/reload printr-un fetch în fundal.
   */
  tenantName: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [email, setEmailState] = useState<string | null>(() =>
    localStorage.getItem(EMAIL_KEY),
  );
  const [tenantName, setTenantNameState] = useState<string | null>(() =>
    localStorage.getItem(TENANT_NAME_KEY),
  );

  // Reîmprospătează numele firmei ori de câte ori tokenul se schimbă (login
  // nou SAU reload de pagină cu un token deja salvat) — nu doar la login,
  // altfel un utilizator care redeschide tab-ul vede fie „gol", fie o
  // valoare cache-uită stale. Eșecul (token expirat/invalid) e ignorat aici
  // în tăcere — RequireAuth/paginile protejate tratează deja 401 pe apelul
  // lor propriu; header-ul rămâne doar cosmetic.
  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    AuthApi.me()
      .then(({ tenantName: name }) => {
        if (cancelled) return;
        localStorage.setItem(TENANT_NAME_KEY, name);
        setTenantNameState(name);
      })
      .catch(() => {
        /* cosmetic — vezi comentariul de mai sus */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      email,
      tenantName,
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
        localStorage.removeItem(TENANT_NAME_KEY);
        setTenantNameState(null);
      },
    }),
    [token, email, tenantName],
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
