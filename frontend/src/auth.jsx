import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken } from "./api.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get("/auth/me")
      .then((d) => setUser({ username: d.username }))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = async (username, password) => {
    const d = await api.post("/auth/login", { username, password });
    localStorage.setItem("token", d.access_token);
    const me = await api.get("/auth/me");
    setUser({ username: me.username });
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    window.location.href = "/login";
  };

  const changePassword = (old_password, new_password) =>
    api.post("/auth/change-password", { old_password, new_password });

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, changePassword }}>
      {children}
    </AuthCtx.Provider>
  );
}
