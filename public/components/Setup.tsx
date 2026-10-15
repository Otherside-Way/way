import { useState } from "react";
import { KeyIcon } from "@heroicons/react/24/outline";
import { Input } from "./Input";
import { Button } from "./Button";

export function Setup({
  onSetup,
  error,
  busy,
}: {
  onSetup: (code: string, password: string) => void;
  error: string;
  busy: boolean;
}) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const mismatch = repeat !== "" && repeat !== password;
  const ready = code.trim() !== "" && password.length >= 8 && password === repeat;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-25 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSetup(code.trim(), password);
        }}
        className="w-full max-w-sm rounded-2xl border border-neutral-100 bg-white p-8 shadow-sm"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-950 text-white">
          <KeyIcon className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-neutral-900">Hidden Numbers</h1>
        <p className="mt-1 text-sm text-neutral-500">Enter the install code you used to install this server and choose a password for the cabinet.</p>

        <div className="mt-6 space-y-4">
          <Input label="Install code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            hint="At least 8 characters."
          />
          <Input label="Repeat the password" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
        </div>

        {mismatch && <p className="mt-3 text-sm font-medium text-red-600">The passwords do not match.</p>}
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

        <Button type="submit" disabled={busy || !ready} className="mt-6 w-full">
          {busy ? "Saving…" : "Open the cabinet"}
        </Button>
      </form>
    </div>
  );
}
