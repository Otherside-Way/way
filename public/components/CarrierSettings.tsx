import { useEffect, useState } from "react";
import { api, type Carrier, type CarrierChange, type CarrierMode } from "../lib/api";
import { Button } from "./Button";
import { Input } from "./Input";
import { StatusBadge, type Tone } from "./StatusBadge";

const MODES: Record<CarrierMode, { title: string; hint: string }> = {
  ipauth: { title: "IP authorisation", hint: "The carrier trusts the IP address of this server." },
  digest: { title: "Login and password", hint: "The carrier asks for a login and a password." },
  direct: { title: "Your own SBC or PBX", hint: "No authentication." },
};

type Message = { tone: Tone; text: string };

type Draft = { host: string; port: string; prefix: string; user: string; pass: string };

function draftOf(carrier: Carrier): Draft {
  return { host: carrier.host ?? "", port: String(carrier.port ?? 5060), prefix: carrier.prefix ?? "", user: carrier.user ?? "", pass: "" };
}

function bodyOf(mode: CarrierMode, draft: Draft): Record<string, unknown> {
  const base = { host: draft.host.trim(), port: Number(draft.port.trim() || 5060), prefix: draft.prefix.trim() };
  return mode === "digest" ? { ...base, user: draft.user.trim(), pass: draft.pass } : base;
}

function failure(e: unknown): Message {
  return { tone: "danger", text: (e as Error).message || "The cabinet did not answer" };
}

function CarrierCard({ carrier, onChanged }: { carrier: Carrier; onChanged: (change: CarrierChange) => void }) {
  const [draft, setDraft] = useState<Draft>(draftOf(carrier));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [turningOff, setTurningOff] = useState(false);

  useEffect(() => {
    setDraft(draftOf(carrier));
  }, [carrier.enabled, carrier.host, carrier.port, carrier.user, carrier.prefix]);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.saveCarrier(carrier.mode, bodyOf(carrier.mode, draft));
      if (res.error && res.synced === undefined) {
        setMessage({ tone: "danger", text: res.error });
        return;
      }
      setDraft((d) => ({ ...d, pass: "" }));
      setMessage(
        res.synced ? { tone: "success", text: "Saved; the platform has the number" } : { tone: "warning", text: `Saved; the platform has not set up the number yet: ${res.error ?? "no answer"}` },
      );
      onChanged(res);
    } catch (e) {
      setMessage(failure(e));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.probeCarrier(carrier.mode);
      if (res.ok) setMessage({ tone: "success", text: `The carrier answers (${res.status}${res.authenticated ? ", login accepted" : ""})` });
      else setMessage({ tone: "warning", text: res.reason ?? res.error ?? "The carrier does not answer" });
    } catch (e) {
      setMessage(failure(e));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setTurningOff(false);
    try {
      const res = await api.disableCarrier(carrier.mode);
      setMessage(res.error && res.synced === undefined ? { tone: "danger", text: res.error } : null);
      onChanged(res);
    } catch (e) {
      setMessage(failure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-800">{MODES[carrier.mode].title}</div>
          <div className="text-xs text-neutral-500">{MODES[carrier.mode].hint}</div>
        </div>
        <StatusBadge label={carrier.enabled ? "on" : "off"} tone={carrier.enabled ? "success" : "neutral"} />
      </div>
      <div className="flex gap-2">
        <div className="flex-[3]">
          <Input label="Carrier address" value={draft.host} placeholder="sip.example.net or 203.0.113.10" onChange={(e) => patch({ host: e.target.value })} />
        </div>
        <div className="flex-1">
          <Input label="Port" value={draft.port} inputMode="numeric" onChange={(e) => patch({ port: e.target.value })} />
        </div>
      </div>
      {carrier.mode === "digest" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Input label="Login" value={draft.user} autoComplete="off" onChange={(e) => patch({ user: e.target.value })} />
          </div>
          <div className="flex-1">
            <Input
              label="Password"
              type="password"
              value={draft.pass}
              autoComplete="new-password"
              placeholder={carrier.hasPassword ? "unchanged" : ""}
              onChange={(e) => patch({ pass: e.target.value })}
            />
          </div>
        </div>
      )}
      <Input label="Dial prefix" value={draft.prefix} placeholder="empty = none" hint="Digits, # or * the carrier wants in front of every number." onChange={(e) => patch({ prefix: e.target.value })} />
      {message && <StatusBadge label={message.text} tone={message.tone} />}
      <div className="flex flex-wrap justify-end gap-2">
        {carrier.enabled && !turningOff && (
          <Button mode="function" disabled={busy} onClick={() => setTurningOff(true)}>
            Turn off
          </Button>
        )}
        {turningOff && (
          <>
            <span className="self-center text-xs text-neutral-500">Calls through this carrier stop after Apply.</span>
            <Button mode="function" disabled={busy} onClick={() => setTurningOff(false)}>
              Keep
            </Button>
            <Button mode="remove" disabled={busy} onClick={turnOff}>
              Turn off
            </Button>
          </>
        )}
        {carrier.enabled && (
          <Button mode="secondary" disabled={busy} onClick={check}>
            Check
          </Button>
        )}
        <Button disabled={busy || !draft.host.trim()} onClick={save}>
          {carrier.enabled ? "Save" : "Turn on"}
        </Button>
      </div>
    </div>
  );
}

export function CarrierSettings({ carriers, pendingApply }: { carriers: Carrier[]; pendingApply: boolean }) {
  const [list, setList] = useState(carriers);
  const [pending, setPending] = useState(pendingApply);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    setList(carriers);
    setPending(pendingApply);
  }, [carriers, pendingApply]);

  const changed = (change: CarrierChange) => {
    if (change.carriers) setList(change.carriers);
    if (change.sipPendingApply !== undefined) setPending(change.sipPendingApply);
  };

  async function apply() {
    setBusy(true);
    setConfirming(false);
    try {
      const res = await api.runSystem("apply-sip");
      setMessage(res.error ? { tone: "danger", text: res.error } : { tone: "info", text: "The SIP proxy restarts with the new carrier settings; this takes about half a minute" });
    } catch (e) {
      setMessage(failure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">Carrier</h3>
        <p className="text-xs text-neutral-500">Where the calls leave for the phone network. Turn on the way your carrier connects.</p>
      </div>
      {pending && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm text-amber-900">
            The changes are saved, but the SIP proxy still uses the previous carrier settings. Applying restarts the SIP proxy: calls in progress drop, so
            apply outside the calling hours.
          </p>
          <div className="flex justify-end gap-2">
            {confirming ? (
              <>
                <Button mode="function" disabled={busy} onClick={() => setConfirming(false)}>
                  Not now
                </Button>
                <Button mode="remove" disabled={busy} onClick={apply}>
                  Restart the SIP proxy
                </Button>
              </>
            ) : (
              <Button disabled={busy} onClick={() => setConfirming(true)}>
                Apply
              </Button>
            )}
          </div>
        </div>
      )}
      {message && <StatusBadge label={message.text} tone={message.tone} />}
      {list
        .filter((c) => c.mode !== "direct" || c.enabled)
        .map((c) => (
          <CarrierCard key={c.mode} carrier={c} onChanged={changed} />
        ))}
    </section>
  );
}
