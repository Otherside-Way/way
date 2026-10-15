import { useCallback, useEffect, useState } from "react";
import { api, type BuildInfo } from "./api";

export type AuthStatus = "checking" | "in" | "out" | "setup";

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((m) => {
        setBuild(m.build ?? null);
        setStatus("in");
      })
      .catch(() =>
        api
          .setupState()
          .then((s) => setStatus(s.pending ? "setup" : "out"))
          .catch(() => setStatus("out")),
      );
  }, []);

  async function enter() {
    const m = await api.me().catch(() => null);
    setBuild(m?.build ?? null);
    setStatus("in");
  }

  async function login(user: string, pass: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api.login(user, pass);
      if (res.ok) await enter();
      else setError(res.error ?? "Invalid credentials");
    } catch {
      setError("The cabinet did not answer; try again");
    } finally {
      setBusy(false);
    }
  }

  async function setup(code: string, password: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api.setup(code, password);
      if (res.ok) {
        setFirstRun(true);
        await enter();
      } else {
        setError(res.error ?? "The install code is not right");
      }
    } catch {
      setError("The cabinet did not answer; try again");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    setStatus("out");
  }

  const finishFirstRun = useCallback(() => setFirstRun(false), []);

  return { status, error, busy, build, firstRun, login, setup, logout, finishFirstRun };
}
