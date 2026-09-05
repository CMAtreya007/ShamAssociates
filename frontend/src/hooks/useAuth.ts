import { useState, useEffect, useCallback } from "react";
import { AuthUser, LoginResponseData } from "../types";
import { loginApi, getCurrentUser, logoutApi, setAuthTokenGetter, setOnUnauthorizedCallback } from "../services/api";

const TOKEN_KEY = "nse_terminal_auth_token";
const USER_KEY = "nse_terminal_auth_user";

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Synchronize token getter for API layer
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await logoutApi().catch(() => {});
      }
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
    }
  }, [token]);

  // Handle automatic 401 logout
  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
    });
  }, []);

  // Validate existing token on boot
  useEffect(() => {
    let isCancelled = false;
    const verifyExistingSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await getCurrentUser();
        if (!isCancelled) {
          setUser(profile);
          localStorage.setItem(USER_KEY, JSON.stringify(profile));
        }
      } catch (err) {
        console.warn("Session verification failed or token expired:", err);
        if (!isCancelled) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    verifyExistingSession();
    return () => {
      isCancelled = true;
    };
  }, []);

  const login = async (username: string, pass: string): Promise<LoginResponseData> => {
    const data = await loginApi(username, pass);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout
  };
}
