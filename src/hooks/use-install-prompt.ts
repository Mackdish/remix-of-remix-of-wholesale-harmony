import { useEffect, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * One shared listener for the browser's install offer, so the sidebar button
 * and the mobile banner both see it (the browser fires it only once per load).
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialised = false;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW registration failed", e));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isMobile() {
  if (typeof navigator === "undefined") return false;
  return isIos() || /Android|Mobi/i.test(navigator.userAgent);
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    init();
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    fn();
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  return {
    canPrompt: deferred !== null,
    installed,
    async prompt() {
      if (!deferred) return "unavailable" as const;
      const evt = deferred;
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      deferred = null;
      notify();
      return outcome;
    },
  };
}
