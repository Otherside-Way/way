import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SystemInfo } from "../lib/api";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";

export function ServerSection() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const startedOn = useRef<string | null>(null);

  const refresh = useCallback(() => {
    api
      .system()
      .then((next) => {
        setInfo(next);
        if (startedOn.current === null) startedOn.current = next.version;
        const done = next.control.available && !next.control.requested && next.control.last?.state === "ok" && next.control.last.action === "update";
        if (done && next.version !== startedOn.current) window.location.reload();
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const control = info?.control;
  const running = Boolean(control?.available && (control.requested || control.last?.state === "running"));

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [running, refresh]);

  async function update() {
    setConfirming(false);
    setError("");
    const res = await api.runSystem("update");
    if (res.error) setError(res.error);
    refresh();
  }

  if (!info || !control) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Version</h3>
          <p className="text-xs text-neutral-500">This server runs version {info.version}.</p>
        </div>
        {control.available && !running && !confirming && (
          <Button mode="secondary" onClick={() => setConfirming(true)}>
            Update
          </Button>
        )}
      </div>
      {!control.available && <p className="text-xs text-neutral-500">To update from here, run update.sh on the server once; after that this button appears.</p>}
      {confirming && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm text-amber-900">
            The server downloads the latest version and restarts the cabinet and the SIP proxy. Calls in progress drop and the cabinet is unavailable for a minute or two.
          </p>
          <div className="flex justify-end gap-2">
            <Button mode="function" onClick={() => setConfirming(false)}>
              Not now
            </Button>
            <Button mode="remove" onClick={update}>
              Update now
            </Button>
          </div>
        </div>
      )}
      {error && <StatusBadge label={error} tone="danger" />}
      {control.available && control.last && (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-neutral-700">
            <span className="font-semibold">{control.last.action === "update" ? "Update" : "SIP proxy restart"}</span>
            {running ? (
              <StatusBadge label="running" tone="info" />
            ) : control.last.state === "ok" ? (
              <StatusBadge label="done" tone="success" />
            ) : (
              <StatusBadge label="failed" tone="danger" />
            )}
            {control.last.finishedAt && !running && <span className="text-xs text-neutral-500">{new Date(control.last.finishedAt).toLocaleString()}</span>}
          </div>
          {control.log.length > 0 && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">{control.log.join("\n")}</pre>
          )}
        </div>
      )}
      {control.available && control.requested && !control.last && <StatusBadge label="waiting for the server to start" tone="info" />}
    </section>
  );
}
