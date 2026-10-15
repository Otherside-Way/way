import { useEffect, useState } from "react";
import { api, type Settings } from "../lib/api";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { CarrierSettings } from "./CarrierSettings";

export function FirstSteps({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .settings()
      .then(setSettings)
      .catch(() => onClose());
  }, [open, onClose]);

  return (
    <Modal
      open={open && settings !== null}
      onClose={onClose}
      title="Finish the setup"
      description={settings ? `Your login is ${settings.keys.cabinetUser}. Two more steps and the server is ready for calls.` : undefined}
      size="lg"
      footer={
        <Button disabled={!downloaded} onClick={onClose}>
          Done
        </Button>
      }
    >
      {settings && (
        <div className="-mr-2 flex max-h-[60vh] flex-col gap-6 overflow-y-auto pr-2">
          <div className="text-sm font-semibold text-neutral-900">1. Connect your carrier</div>
          <CarrierSettings carriers={settings.carriers} pendingApply={settings.sipPendingApply} />
          <section className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-neutral-900">2. Keep a copy of the keys</div>
            <p className="text-xs text-neutral-500">
              The tokens can be turned back into numbers only with these keys, and they exist only on this server. Keep the file somewhere safe outside the
              server: without it a lost server means a lost base.
            </p>
            <a
              href="/api/settings/keys.env"
              onClick={() => setDownloaded(true)}
              className="self-start rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Download the keys
            </a>
          </section>
        </div>
      )}
    </Modal>
  );
}
