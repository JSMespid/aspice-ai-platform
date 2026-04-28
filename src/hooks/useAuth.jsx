import { createContext, useContext, useState, useEffect } from "react";

// 데모용 계정 — 시연 후 Supabase Auth로 대체 가능
const DEMO_ACCOUNTS = [
  { email: "admin@aspice.com", password: "demo1234", name: "관리자", role: "Admin", org: "새시팀" },
  { email: "engineer@aspice.com", password: "demo1234", name: "엔지니어", role: "Engineer", org: "새시팀" },
  { email: "reviewer@aspice.com", password: "demo1234", name: "검토자", role: "Reviewer", org: "QA팀" },
];

const AuthContext = createContext(null);

const SESSION_KEY = "aspice_session";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        // Sessions valid for 24 hours
        if (session.expires > Date.now()) {
          setUser(session.user);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  function login(email, password) {
    const account = DEMO_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password
    );
    if (!account) {
      return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    const u = { email: account.email, name: account.name, role: account.role, org: account.org };
    const session = { user: u, expires: Date.now() + 24 * 60 * 60 * 1000 };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(u);
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
