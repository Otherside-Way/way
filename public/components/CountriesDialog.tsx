import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { api, type CountryStat } from "../lib/api";

const RESULT_ORDER = ["send_sms", "no_answer", "voicemail", "busy", "hang_up", "not_interested", "failed_call", "blacklist"];

function regionNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
}

const REGIONS = regionNames();

function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return REGIONS?.of(code) ?? code;
  } catch {
    return code;
  }
}

function Breakdown({ byResult }: { byResult: Record<string, number> }) {
  const entries = RESULT_ORDER.filter((r) => (byResult[r] ?? 0) > 0);
  if (entries.length === 0) return <span className="text-neutral-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map((r) => (
        <span key={r} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
          {r} <b className="text-neutral-900">{byResult[r]}</b>
        </span>
      ))}
    </span>
  );
}

export function CountriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [countries, setCountries] = useState<CountryStat[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCountries([]);
    setLoadError(null);
    setLoading(true);
    api
      .countryStats()
      .then((res) => {
        if (!cancelled) setCountries(res.countries);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const total = countries.reduce(
    (acc, c) => ({
      numbers: acc.numbers + c.numbers,
      requests: acc.requests + c.requests,
      results: acc.results + c.results,
      call_attempts: acc.call_attempts + c.call_attempts,
    }),
    { numbers: 0, requests: 0, results: 0, call_attempts: 0 },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Countries"
      description="The country of every number is read from the number itself. Only the country code goes to the platform."
      size="lg"
      footer={
        <Button mode="function" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {loadError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
        <div className="-mr-2 max-h-[55vh] overflow-y-auto pr-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Country</th>
                <th className="py-2 pr-3 text-right">Numbers</th>
                <th className="py-2 pr-3 text-right">Calls requested</th>
                <th className="py-2 pr-3 text-right">Results</th>
                <th className="py-2 pr-3 text-right">Attempts</th>
                <th className="py-2">By result</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((c) => (
                <tr key={c.country ?? ""} className="border-t border-neutral-100">
                  <td className="py-2 pr-3">
                    {c.country && <span className="mr-2 font-mono text-neutral-500">{c.country}</span>}
                    {countryName(c.country)}
                  </td>
                  <td className="py-2 pr-3 text-right">{c.numbers}</td>
                  <td className="py-2 pr-3 text-right">{c.requests}</td>
                  <td className="py-2 pr-3 text-right">{c.results}</td>
                  <td className="py-2 pr-3 text-right">{c.call_attempts}</td>
                  <td className="py-2">
                    <Breakdown byResult={c.by_result} />
                  </td>
                </tr>
              ))}
            </tbody>
            {countries.length > 1 && (
              <tfoot>
                <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right">{total.numbers}</td>
                  <td className="py-2 pr-3 text-right">{total.requests}</td>
                  <td className="py-2 pr-3 text-right">{total.results}</td>
                  <td className="py-2 pr-3 text-right">{total.call_attempts}</td>
                  <td className="py-2" />
                </tr>
              </tfoot>
            )}
          </table>
          {loading && <p className="py-6 text-center text-sm text-neutral-400">Loading…</p>}
          {countries.length === 0 && !loading && !loadError && <p className="py-6 text-center text-sm text-neutral-400">No numbers yet.</p>}
        </div>
      </div>
    </Modal>
  );
}
