"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, SlidersHorizontal } from "lucide-react";
import { respondToNotificationAction } from "@/app/actions/orbit-actions";
import type { CheckInMetadataPayload } from "@/modules/notifications/notification-service";
import { AreaLabel, Card, PageHeader } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface CheckInAreaOption {
  id: string;
  name: string;
  colorToken: string;
}

export interface CheckInViewData {
  id: string;
  category: string;
  title: string;
  body: string;
  status: string;
  responseValue: string | null;
  responseNote: string | null;
  deliveredAtLabel: string;
  metadata: CheckInMetadataPayload;
}

const DURATION_CHOICES = [
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
  { minutes: 45, label: "45m" },
  { minutes: 60, label: "60m" },
];

export function CheckInResponseClient({
  checkIn,
  lifeAreas,
}: {
  checkIn: CheckInViewData;
  lifeAreas: CheckInAreaOption[];
}) {
  const router = useRouter();
  const idBase = useId();
  const { notify } = useOrbitToast();

  const [selectedAreaId, setSelectedAreaId] = useState<string>(
    lifeAreas[0]?.id ?? ""
  );
  const [selectedDuration, setSelectedDuration] = useState<number>(45);
  const [taskNote, setTaskNote] = useState<string>("");

  const isResolved =
    checkIn.status === "RESPONDED" || checkIn.status === "DISMISSED";
  const { metadata } = checkIn;

  const headerTitle =
    metadata.promptKind === "BRIEFING"
      ? "Morning briefing"
      : metadata.promptKind === "ACTIVITY"
        ? "Quick check-in"
        : "Task check-in";

  return (
    <div className="page">
      <PageHeader
        breadcrumbs={[
          { label: "Today", href: "/" },
          { label: "Check-in" },
        ]}
        title={headerTitle}
        subtitle={`Sent ${checkIn.deliveredAtLabel}`}
      >
        <Link href="/settings" className="btn btn-ghost btn-sm">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </PageHeader>

      <Card title={checkIn.title}>
        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <p className="meta">{checkIn.body}</p>
            {(metadata.lifeAreaName || metadata.scheduledWindowLabel) && (
              <p className="meta flex flex-wrap items-center gap-x-3">
                {metadata.lifeAreaName && (
                  <AreaLabel
                    name={metadata.lifeAreaName}
                    token={metadata.lifeAreaColor ?? "slate"}
                  />
                )}
                {metadata.scheduledWindowLabel && (
                  <span className="tabular">
                    {metadata.scheduledWindowLabel}
                  </span>
                )}
              </p>
            )}
          </div>

          {isResolved ? (
            <div className="space-y-3 border-t border-base-300/60 pt-4">
              <p className="meta font-medium text-base-content">
                {checkIn.status === "DISMISSED"
                  ? "Skipped this check-in."
                  : `Saved response: ${checkIn.responseValue?.replace(/_/g, " ").toLowerCase() ?? "done"}.`}
              </p>
              {checkIn.responseNote && (
                <p className="meta-soft">{checkIn.responseNote}</p>
              )}
              <div>
                <Link href="/" className="btn btn-primary btn-sm">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Today</span>
                </Link>
              </div>
            </div>
          ) : metadata.promptKind === "BRIEFING" ? (
            <div className="space-y-4 border-t border-base-300/60 pt-3">
              {metadata.briefingHighlights &&
                metadata.briefingHighlights.length > 0 && (
                  <ul className="divide-y divide-base-300/60">
                    {metadata.briefingHighlights.map((item, idx) => (
                      <li key={idx} className="py-2.5 text-[0.9375rem]">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

              <div className="flex flex-wrap items-center gap-2">
                <form
                  action={async (fd) => {
                    await respondToNotificationAction(fd);
                    notify("Briefing acknowledged");
                    router.push("/");
                  }}
                >
                  <input
                    type="hidden"
                    name="notificationId"
                    value={checkIn.id}
                  />
                  <input
                    type="hidden"
                    name="responseValue"
                    value="ACKNOWLEDGE"
                  />
                  <SubmitButton pendingLabel="Saving" className="btn btn-primary">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span>Open Today</span>
                  </SubmitButton>
                </form>
              </div>
            </div>
          ) : metadata.promptKind === "ACTIVITY" ? (
            <form
              action={async (fd) => {
                await respondToNotificationAction(fd);
                notify("Work logged");
                router.push("/");
              }}
              className="space-y-4 border-t border-base-300/60 pt-4"
            >
              <input type="hidden" name="notificationId" value={checkIn.id} />
              <input type="hidden" name="responseValue" value="LOG_WORK" />

              <fieldset className="fieldset">
                <label
                  htmlFor={`${idBase}-work-title`}
                  className="fieldset-legend"
                >
                  What are you working on?
                </label>
                <input
                  id={`${idBase}-work-title`}
                  name="responseNote"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="API integration or vocal warmups"
                  className="input w-full bg-base-100"
                />
              </fieldset>

              {lifeAreas.length > 0 && lifeAreas.length <= 5 ? (
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Area</legend>
                  <div className="flex flex-wrap gap-2">
                    {lifeAreas.map((area) => {
                      const active = selectedAreaId === area.id;
                      return (
                        <label
                          key={area.id}
                          className={`btn btn-sm cursor-pointer ${
                            active ? "btn-primary" : "btn-secondary bg-base-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name="lifeAreaId"
                            value={area.id}
                            checked={active}
                            onChange={() => setSelectedAreaId(area.id)}
                            className="visually-hidden"
                          />
                          <span>{area.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <fieldset className="fieldset">
                  <label htmlFor={`${idBase}-area`} className="fieldset-legend">
                    Area
                  </label>
                  <select
                    id={`${idBase}-area`}
                    name="lifeAreaId"
                    value={selectedAreaId}
                    onChange={(e) => setSelectedAreaId(e.target.value)}
                    className="select w-full bg-base-100"
                  >
                    {lifeAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </fieldset>
              )}

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Time spent</legend>
                <div className="flex flex-wrap gap-2">
                  {DURATION_CHOICES.map((d) => {
                    const active = selectedDuration === d.minutes;
                    return (
                      <label
                        key={d.minutes}
                        className={`btn btn-sm cursor-pointer tabular ${
                          active ? "btn-primary" : "btn-secondary bg-base-100"
                        }`}
                      >
                        <input
                          type="radio"
                          name="durationMinutes"
                          value={d.minutes}
                          checked={active}
                          onChange={() => setSelectedDuration(d.minutes)}
                          className="visually-hidden"
                        />
                        <span>{d.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <SubmitButton pendingLabel="Logging" className="btn btn-primary">
                  Log work
                </SubmitButton>
              </div>
            </form>
          ) : (
            <div className="space-y-4 border-t border-base-300/60 pt-4">
              <details className="rounded-xl border border-base-300/80 bg-base-100 px-3.5 py-2.5">
                <summary className="cursor-pointer text-sm font-medium select-none">
                  Add a note (optional)
                </summary>
                <div className="mt-2.5">
                  <label
                    htmlFor={`${idBase}-task-note`}
                    className="visually-hidden"
                  >
                    Note for this check-in
                  </label>
                  <input
                    id={`${idBase}-task-note`}
                    type="text"
                    value={taskNote}
                    onChange={(e) => setTaskNote(e.target.value)}
                    placeholder="Waiting on API key or need 30 more mins"
                    className="input input-sm w-full"
                  />
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2">
                {metadata.options.map((opt) => {
                  const btnClass =
                    opt.tone === "primary"
                      ? "btn btn-primary"
                      : opt.tone === "secondary"
                        ? "btn btn-secondary bg-base-100"
                        : "btn btn-ghost";
                  return (
                    <form
                      key={opt.value}
                      action={async (fd) => {
                        await respondToNotificationAction(fd);
                        notify("Check-in saved");
                        router.push("/");
                      }}
                    >
                      <input
                        type="hidden"
                        name="notificationId"
                        value={checkIn.id}
                      />
                      <input
                        type="hidden"
                        name="responseValue"
                        value={opt.value}
                      />
                      {taskNote.trim() && (
                        <input
                          type="hidden"
                          name="responseNote"
                          value={taskNote.trim()}
                        />
                      )}
                      <SubmitButton
                        pendingLabel="Saving"
                        className={btnClass}
                      >
                        {opt.label}
                      </SubmitButton>
                    </form>
                  );
                })}
              </div>
            </div>
          )}

          {!isResolved && metadata.promptKind === "ACTIVITY" && (
            <form
              action={async (fd) => {
                await respondToNotificationAction(fd);
                notify("Check-in skipped");
                router.push("/");
              }}
            >
              <input type="hidden" name="notificationId" value={checkIn.id} />
              <input type="hidden" name="responseValue" value="DISMISS" />
              <button type="submit" className="btn btn-ghost btn-sm">
                Skip for now
              </button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
