import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isIos, isMobile, isStandalone, useInstallPrompt } from "@/hooks/use-install-prompt";

const DISMISS_KEY = "werp-install-dismissed-at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // ask again after a week

/** Bottom banner inviting phone/tablet users to add the app to their home screen. */
export function MobileInstallPrompt() {
  const { canPrompt, installed, prompt } = useInstallPrompt();
  const [eligible, setEligible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone()) return;
    const last = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (last && Date.now() - last < SNOOZE_MS) return;
    setIos(isIos());
    const t = window.setTimeout(() => setEligible(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  };

  // Android/Chrome needs the browser's install offer; iPhone/iPad gets manual steps.
  if (!eligible || hidden || installed || (!ios && !canPrompt)) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Wholesale ERP"
      className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 fade-in"
    >
      <div className="mx-auto max-w-md rounded-xl border bg-card text-card-foreground shadow-lg p-4">
        <div className="flex items-start gap-3">
          <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">Install Wholesale ERP</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Open it from your home screen like a normal app, full screen and one tap away.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Not now"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {ios && showIosSteps ? (
          <ol className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="font-medium">1.</span> Tap the <Share className="h-4 w-4 inline text-primary" /> Share button in Safari
            </li>
            <li className="flex items-center gap-2">
              <span className="font-medium">2.</span> Choose <SquarePlus className="h-4 w-4 inline text-primary" /> “Add to Home Screen”
            </li>
            <li className="flex items-center gap-2">
              <span className="font-medium">3.</span> Tap “Add”
            </li>
          </ol>
        ) : null}

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>Not now</Button>
          {ios ? (
            showIosSteps ? (
              <Button size="sm" onClick={dismiss}>Got it</Button>
            ) : (
              <Button size="sm" onClick={() => setShowIosSteps(true)}>
                <Download className="h-4 w-4 mr-2" />Show me how
              </Button>
            )
          ) : (
            <Button
              size="sm"
              onClick={async () => {
                const outcome = await prompt();
                if (outcome !== "accepted") dismiss();
              }}
            >
              <Download className="h-4 w-4 mr-2" />Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
