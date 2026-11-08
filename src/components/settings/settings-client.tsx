"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  Send,
  Smartphone,
  Trash2,
} from "lucide-react";
import {
  removePushSubscriptionAction,
  respondToNotificationAction,
  sendTestWebPushAction,
  triggerProactiveCheckInAction,
  updateUserPreferencesAction,
} from "@/app/actions/orbit-actions";
import { AreaLabel, Card, PageHeader } from "@/components/ui/page";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface SettingsPreferenceShape {
  ianaTimeZone: string;
  morningBriefingEnabled: boolean;
  morningBriefingTime: string;
  declaredWakeTime: string;
  declaredSleepTime: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxDailyCheckIns: number;
  defaultPreTaskReminderMin: number;
  randomCheckInsEnabled: boolean;
  checkInFrequency: "MINIMAL" | "BALANCED" | "PROACTIVE";
  minMinutesBetweenCheckIns: number;
}

export interface SettingsNotificationItem {
  id: string;
  title: string;
  body: string;
  status: string;
  whenLabel: string;
  actionUrl: string;
  lifeArea: {
    name: string;
    colorToken: string;
  } | null;
}

export interface SettingsPushDeviceItem {
  id: string;
  deviceName: string;
  endpointHost: string;
  addedLabel: string;
}

const COMMON_TIME_ZONES = [
  "Africa/Lagos",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function SettingsClient({
  initialTab,
  preferences,
  notifications,
  pushDevices,
  vapidPublicKey,
}: {
  initialTab: "checkins" | "preferences";
  preferences: SettingsPreferenceShape;
  notifications: SettingsNotificationItem[];
  pushDevices: SettingsPushDeviceItem[];
  vapidPublicKey: string | null;
}) {
  const router = useRouter();
  const idBase = useId();
  const { notify } = useOrbitToast();
  const testModalRef = useRef<HTMLDialogElement | null>(null);

  const [tab, setTab] = useState<"checkins" | "preferences">(initialTab);
  const [timeZone, setTimeZone] = useState<string>(preferences.ianaTimeZone);
  const [morningEnabled, setMorningEnabled] = useState<boolean>(
    preferences.morningBriefingEnabled
  );
  const [quietEnabled, setQuietEnabled] = useState<boolean>(
    preferences.quietHoursEnabled
  );
  const [randomEnabled, setRandomEnabled] = useState<boolean>(
    preferences.randomCheckInsEnabled
  );
  const [preReminderMin, setPreReminderMin] = useState<number>(
    preferences.defaultPreTaskReminderMin
  );
  const [pace, setPace] = useState<"MINIMAL" | "BALANCED" | "PROACTIVE">(
    preferences.checkInFrequency
  );

  const [pushSupportState, setPushSupportState] = useState<
    "checking" | "unsupported" | "default" | "granted" | "denied"
  >("checking");
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [triggeringKind, setTriggeringKind] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setPushSupportState("unsupported");
      return;
    }
    setPushSupportState(Notification.permission);

    // Feature-detect native HTML switch support; keep role="switch" on checkboxes where absent
  }, []);

  const unreadCount = notifications.filter(
    (n) => n.status === "DELIVERED"
  ).length;

  const zoneOptions = COMMON_TIME_ZONES.includes(timeZone)
    ? COMMON_TIME_ZONES
    : [timeZone, ...COMMON_TIME_ZONES];

  function detectBrowserZone() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        setTimeZone(detected);
        notify(`Zone set to ${detected}`);
      }
    } catch {
      notify("Could not read browser time zone");
    }
  }

  function openTestCheckInModal() {
    const dialog = testModalRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  async function handleTriggerSample(
    kind: "MORNING_BRIEFING" | "TASK_CHECKIN" | "RANDOM_CHECKIN"
  ) {
    setTriggeringKind(kind);
    try {
      const res = await triggerProactiveCheckInAction(kind);
      testModalRef.current?.close();
      notify(res.message);
      setTab("checkins");
      router.refresh();
    } finally {
      setTriggeringKind(null);
    }
  }

  async function enablePushOnDevice() {
    if (!vapidPublicKey) {
      notify("Push keys are not configured.");
      return;
    }
    setIsSubscribingPush(true);
    try {
      const permission = await Notification.requestPermission();
      setPushSupportState(permission);
      if (permission !== "granted") {
        notify("Notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        try {
          await existing.unsubscribe();
        } catch {
          // Continue to subscribe with current applicationServerKey
        }
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        notify("Browser did not return valid push keys.");
        return;
      }

      const platformLabel =
        navigator.platform || "Browser";
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          },
          deviceName: `Web Push (${platformLabel})`,
        }),
      });

      if (response.ok) {
        notify("Push enabled on this browser");
        router.refresh();
      } else {
        notify("Could not save push subscription");
      }
    } catch {
      notify("Could not enable push on this browser");
    } finally {
      setIsSubscribingPush(false);
    }
  }

  async function handleSendTestPush() {
    setIsSendingTestPush(true);
    try {
      const res = await sendTestWebPushAction();
      if (res.delivered > 0) {
        notify(`Sent push to ${res.delivered} ${res.delivered === 1 ? "device" : "devices"}`);
      } else if (res.attempted === 0) {
        notify("Enable push on a device first");
      } else {
        notify("Subscription expired or key updated. Click Enable on this browser to reconnect.");
      }
      router.refresh();
    } finally {
      setIsSendingTestPush(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="Settings">
        {tab === "checkins" ? (
          <button
            type="button"
            onClick={openTestCheckInModal}
            className="btn btn-primary btn-sm sm:btn-md"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>Test check-in</span>
          </button>
        ) : (
          <button
            type="submit"
            form="orbit-preferences-form"
            className="btn btn-primary btn-sm sm:btn-md"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>Save changes</span>
          </button>
        )}
      </PageHeader>

      <div className="space-y-2">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="tabs tabs-box tabs-sm w-full flex-nowrap sm:w-auto sm:inline-flex"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "checkins"}
            onClick={() => setTab("checkins")}
            className={`tab flex-1 gap-2 font-medium sm:flex-initial sm:px-5 ${
              tab === "checkins" ? "tab-active" : ""
            }`}
          >
            <span>Check-ins</span>
            {unreadCount > 0 && (
              <span className="badge badge-xs badge-neutral tabular">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preferences"}
            onClick={() => setTab("preferences")}
            className={`tab flex-1 font-medium sm:flex-initial sm:px-5 ${
              tab === "preferences" ? "tab-active" : ""
            }`}
          >
            Preferences
          </button>
        </div>

        <p className="meta">
          {tab === "checkins"
            ? "Proactive briefings and commitment check-ins from Orbit."
            : "Time zone, morning briefing, quiet hours, and push devices."}
        </p>
      </div>

      {tab === "checkins" ? (
        <Card title="Recent check-ins">
          {notifications.length === 0 ? (
            <div className="orbit-row">
              <p className="meta orbit-row-main">
                No check-ins yet. Send a test briefing or task check-in to try
                the flow.
              </p>
              <button
                type="button"
                onClick={openTestCheckInModal}
                className="btn btn-secondary btn-sm bg-base-100"
              >
                Send test check-in
              </button>
            </div>
          ) : (
            notifications.map((item) => {
              const isWaiting = item.status === "DELIVERED";
              const isSuppressed = item.status === "SUPPRESSED_QUIET_HOURS";
              return (
                <div key={item.id} className="orbit-row">
                  <div className="orbit-row-main">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="title">{item.title}</p>
                      {isWaiting && (
                        <span className="badge badge-neutral badge-xs">
                          Needs reply
                        </span>
                      )}
                      {isSuppressed && (
                        <span className="badge badge-ghost badge-xs">
                          Held in quiet hours
                        </span>
                      )}
                    </div>
                    <p className="meta">{item.body}</p>
                    <p className="meta-soft flex flex-wrap items-center gap-x-3">
                      <span className="tabular">{item.whenLabel}</span>
                      {item.lifeArea && (
                        <AreaLabel
                          name={item.lifeArea.name}
                          token={item.lifeArea.colorToken}
                        />
                      )}
                    </p>
                  </div>
                  <div className="orbit-row-actions">
                    <Link
                      href={item.actionUrl}
                      className={
                        isWaiting
                          ? "btn btn-primary btn-sm"
                          : "btn btn-ghost btn-sm"
                      }
                    >
                      {isWaiting ? "Respond" : "View"}
                    </Link>
                    {isWaiting && (
                      <form
                        action={async (fd) => {
                          await respondToNotificationAction(fd);
                          notify("Check-in dismissed");
                        }}
                      >
                        <input
                          type="hidden"
                          name="notificationId"
                          value={item.id}
                        />
                        <input
                          type="hidden"
                          name="responseValue"
                          value="DISMISS"
                        />
                        <button
                          type="submit"
                          aria-label={`Dismiss ${item.title}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Dismiss
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          <form
            id="orbit-preferences-form"
            action={async (fd) => {
              await updateUserPreferencesAction(fd);
              notify("Preferences saved");
            }}
            className="space-y-5"
          >
            <input
              type="hidden"
              name="minMinutesBetweenCheckIns"
              value={preferences.minMinutesBetweenCheckIns}
            />

            <Card
              title="Time and morning briefing"
              action={
                <button
                  type="button"
                  onClick={detectBrowserZone}
                  className="btn btn-ghost btn-sm"
                >
                  Use device zone
                </button>
              }
            >
              <div className="mt-2 space-y-4">
                <fieldset className="fieldset">
                  <label htmlFor={`${idBase}-tz`} className="fieldset-legend">
                    Time zone
                  </label>
                  <select
                    id={`${idBase}-tz`}
                    name="ianaTimeZone"
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="select w-full bg-base-100"
                  >
                    {zoneOptions.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </fieldset>

                <div className="flex items-center justify-between gap-4 border-t border-base-300/60 pt-3">
                  <div>
                    <label
                      htmlFor={`${idBase}-briefing-toggle`}
                      className="title cursor-pointer"
                    >
                      Morning briefing
                    </label>
                    <p className="meta">
                      Daily summary of location window and commitments.
                    </p>
                  </div>
                  <input
                    id={`${idBase}-briefing-toggle`}
                    name="morningBriefingEnabled"
                    type="checkbox"
                    role="switch"
                    checked={morningEnabled}
                    onChange={(e) => setMorningEnabled(e.target.checked)}
                    className="toggle toggle-primary"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-briefing-time`}
                      className="fieldset-legend"
                    >
                      Briefing time
                    </label>
                    <input
                      id={`${idBase}-briefing-time`}
                      name="morningBriefingTime"
                      type="time"
                      defaultValue={preferences.morningBriefingTime}
                      className="input w-full bg-base-100 tabular"
                    />
                  </fieldset>

                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-wake`}
                      className="fieldset-legend"
                    >
                      Wake time
                    </label>
                    <input
                      id={`${idBase}-wake`}
                      name="declaredWakeTime"
                      type="time"
                      defaultValue={preferences.declaredWakeTime}
                      className="input w-full bg-base-100 tabular"
                    />
                  </fieldset>

                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-sleep`}
                      className="fieldset-legend"
                    >
                      Sleep time
                    </label>
                    <input
                      id={`${idBase}-sleep`}
                      name="declaredSleepTime"
                      type="time"
                      defaultValue={preferences.declaredSleepTime}
                      className="input w-full bg-base-100 tabular"
                    />
                  </fieldset>
                </div>
              </div>
            </Card>

            <Card title="Quiet hours and pace">
              <div className="mt-2 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor={`${idBase}-quiet-toggle`}
                      className="title cursor-pointer"
                    >
                      Quiet hours
                    </label>
                    <p className="meta">
                      Hold check-ins overnight so Orbit never interrupts rest.
                    </p>
                  </div>
                  <input
                    id={`${idBase}-quiet-toggle`}
                    name="quietHoursEnabled"
                    type="checkbox"
                    role="switch"
                    checked={quietEnabled}
                    onChange={(e) => setQuietEnabled(e.target.checked)}
                    className="toggle toggle-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-quiet-start`}
                      className="fieldset-legend"
                    >
                      Quiet start
                    </label>
                    <input
                      id={`${idBase}-quiet-start`}
                      name="quietHoursStart"
                      type="time"
                      defaultValue={preferences.quietHoursStart}
                      className="input w-full bg-base-100 tabular"
                    />
                  </fieldset>

                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-quiet-end`}
                      className="fieldset-legend"
                    >
                      Quiet end
                    </label>
                    <input
                      id={`${idBase}-quiet-end`}
                      name="quietHoursEnd"
                      type="time"
                      defaultValue={preferences.quietHoursEnd}
                      className="input w-full bg-base-100 tabular"
                    />
                  </fieldset>
                </div>

                <fieldset className="fieldset border-t border-base-300/60 pt-3">
                  <legend className="fieldset-legend">
                    Heads-up before scheduled tasks
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60].map((mins) => {
                      const active = preReminderMin === mins;
                      return (
                        <label
                          key={mins}
                          className={`btn btn-sm cursor-pointer tabular ${
                            active ? "btn-primary" : "btn-secondary bg-base-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name="defaultPreTaskReminderMin"
                            value={mins}
                            checked={active}
                            onChange={() => setPreReminderMin(mins)}
                            className="visually-hidden"
                          />
                          <span>{mins} min</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex items-center justify-between gap-4 border-t border-base-300/60 pt-3">
                  <div>
                    <label
                      htmlFor={`${idBase}-random-toggle`}
                      className="title cursor-pointer"
                    >
                      Activity check-ins
                    </label>
                    <p className="meta">
                      Occasional prompt to log what you are working on.
                    </p>
                  </div>
                  <input
                    id={`${idBase}-random-toggle`}
                    name="randomCheckInsEnabled"
                    type="checkbox"
                    role="switch"
                    checked={randomEnabled}
                    onChange={(e) => setRandomEnabled(e.target.checked)}
                    className="toggle toggle-primary"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend">Check-in pace</legend>
                    <div className="space-y-2">
                      {(
                        [
                          ["MINIMAL", "Minimal (at least 4h apart)"],
                          ["BALANCED", "Balanced (every 2h max)"],
                          ["PROACTIVE", "Proactive (every 60 to 90m)"],
                        ] as const
                      ).map(([val, label]) => (
                        <label
                          key={val}
                          className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem]"
                        >
                          <input
                            type="radio"
                            name="checkInFrequency"
                            value={val}
                            checked={pace === val}
                            onChange={() => setPace(val)}
                            className="radio radio-sm radio-primary"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-cap`}
                      className="fieldset-legend"
                    >
                      Daily check-in limit
                    </label>
                    <input
                      id={`${idBase}-cap`}
                      name="maxDailyCheckIns"
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={preferences.maxDailyCheckIns}
                      className="input w-full bg-base-100 tabular"
                    />
                  </fieldset>
                </div>

                <div className="pt-2">
                  <SubmitButton
                    pendingLabel="Saving"
                    className="btn btn-primary"
                  >
                    Save changes
                  </SubmitButton>
                </div>
              </div>
            </Card>
          </form>

          <Card title="Push notifications">
            <div className="mt-2 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="title">
                    {pushSupportState === "granted"
                      ? "Browser permission granted"
                      : pushSupportState === "denied"
                        ? "Blocked in browser settings"
                        : pushSupportState === "unsupported"
                          ? "Web Push not supported in this browser"
                          : "Enable Web Push on this device"}
                  </p>
                  <p className="meta">
                    Receive check-ins even when Orbit is in the background.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {pushSupportState !== "unsupported" &&
                    pushSupportState !== "denied" && (
                      <button
                        type="button"
                        disabled={isSubscribingPush}
                        onClick={() => void enablePushOnDevice()}
                        className="btn btn-primary btn-sm"
                      >
                        <Smartphone className="h-4 w-4" aria-hidden="true" />
                        <span>
                          {isSubscribingPush
                            ? "Enabling"
                            : "Enable on this browser"}
                        </span>
                      </button>
                    )}

                  {pushDevices.length > 0 && (
                    <button
                      type="button"
                      disabled={isSendingTestPush}
                      onClick={() => void handleSendTestPush()}
                      className="btn btn-secondary btn-sm bg-base-100"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {isSendingTestPush ? "Sending" : "Send test push"}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {pushDevices.length > 0 && (
                <div className="border-t border-base-300/60 pt-2">
                  {pushDevices.map((dev) => (
                    <div key={dev.id} className="orbit-row">
                      <div className="orbit-row-main">
                        <p className="title">{dev.deviceName}</p>
                        <p className="meta tabular">
                          {dev.endpointHost} · Added {dev.addedLabel}
                        </p>
                      </div>
                      <form
                        action={async (fd) => {
                          await removePushSubscriptionAction(fd);
                          notify("Device removed");
                        }}
                      >
                        <input
                          type="hidden"
                          name="subscriptionId"
                          value={dev.id}
                        />
                        <button
                          type="submit"
                          aria-label={`Remove ${dev.deviceName}`}
                          className="btn btn-ghost btn-sm text-error"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <OrbitModal
        dialogRef={testModalRef}
        title="Send test check-in"
        maxWidthClass="sm:max-w-md"
      >
        <div className="space-y-3">
          <p className="meta">
            Pick a proactive check-in to generate right now and test the
            1-tap response flow.
          </p>

          <div className="space-y-2">
            <button
              type="button"
              disabled={triggeringKind !== null}
              onClick={() => void handleTriggerSample("MORNING_BRIEFING")}
              className="btn btn-secondary w-full justify-between"
            >
              <span>Morning briefing</span>
              <span className="text-xs text-[var(--text-2)]">
                {triggeringKind === "MORNING_BRIEFING" ? "Sending" : "Send"}
              </span>
            </button>

            <button
              type="button"
              disabled={triggeringKind !== null}
              onClick={() => void handleTriggerSample("TASK_CHECKIN")}
              className="btn btn-secondary w-full justify-between"
            >
              <span>Task commitment check-in</span>
              <span className="text-xs text-[var(--text-2)]">
                {triggeringKind === "TASK_CHECKIN" ? "Sending" : "Send"}
              </span>
            </button>

            <button
              type="button"
              disabled={triggeringKind !== null}
              onClick={() => void handleTriggerSample("RANDOM_CHECKIN")}
              className="btn btn-secondary w-full justify-between"
            >
              <span>Activity check-in</span>
              <span className="text-xs text-[var(--text-2)]">
                {triggeringKind === "RANDOM_CHECKIN" ? "Sending" : "Send"}
              </span>
            </button>
          </div>

          <div className="modal-action">
            <button
              type="button"
              onClick={() => testModalRef.current?.close()}
              className="btn btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      </OrbitModal>
    </div>
  );
}
