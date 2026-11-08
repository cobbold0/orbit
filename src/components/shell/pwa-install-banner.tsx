"use client";

import React, { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already running as installed standalone PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean(
          (window.navigator as unknown as { standalone?: boolean }).standalone
        ));
    setIsStandalone(standalone);

    if (standalone) return;

    // Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari =
      /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIosSafari(isIos && isSafari);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (isStandalone || isDismissed || (!deferredPrompt && !isIosSafari)) {
    return null;
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsStandalone(true);
    }
    setDeferredPrompt(null);
  }

  return (
    <div
      role="region"
      aria-label="Install Orbit"
      className="mb-4 rounded-2xl border border-base-300/80 bg-base-100 p-3.5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold tracking-tight text-base-content">
            Install Orbit app
          </p>
          <p className="meta mt-0.5 text-xs sm:text-[0.8125rem]">
            {isIosSafari ? (
              <span className="inline-flex items-center gap-1">
                Tap <Share className="inline h-3.5 w-3.5" aria-hidden="true" />{" "}
                Share in Safari, then select{" "}
                <span className="font-medium text-base-content">
                  Add to Home Screen
                </span>
                .
              </span>
            ) : (
              "Install on your device for standalone window, offline access, and instant check-ins."
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {deferredPrompt && (
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="btn btn-primary btn-xs sm:btn-sm"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Install</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="btn btn-ghost btn-xs sm:btn-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
