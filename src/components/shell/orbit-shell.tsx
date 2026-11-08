"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  CalendarRange,
  History,
  Inbox,
  Layers,
  Plus,
  X,
} from "lucide-react";
import {
  createStructuredTaskAction,
  quickCaptureAction,
} from "@/app/actions/orbit-actions";
import { AreaDot } from "@/components/ui/page";

export interface ShellLifeArea {
  id: string;
  name: string;
  slug: string;
  colorToken: string;
}

export interface ShellProject {
  id: string;
  title: string;
  lifeAreaId: string;
}

interface OrbitShellProps {
  children: React.ReactNode;
  lifeAreas: ShellLifeArea[];
  projects: ShellProject[];
  unreviewedInboxCount?: number;
}

const NAV_ITEMS = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/areas", label: "Areas", icon: Layers },
  { href: "/routines", label: "Activity", icon: History },
  { href: "/inbox", label: "Inbox", icon: Inbox },
];

type CommitmentChoice = "FLEXIBLE" | "SCHEDULED" | "WAITING";

export function OrbitShell({
  children,
  lifeAreas,
  projects,
  unreviewedInboxCount = 0,
}: OrbitShellProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"quick" | "detailed">("quick");
  const [commitment, setCommitment] = useState<CommitmentChoice>("FLEXIBLE");
  const [areaId, setAreaId] = useState<string>(lifeAreas[0]?.id ?? "");

  // Light dismiss fallback for browsers without <dialog closedby>
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
    const outside = (event: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      );
    };
    let pressedOutside = false;
    const onDown = (event: PointerEvent) => {
      if (event.target === dialog) pressedOutside = outside(event);
      else pressedOutside = false;
    };
    const onUp = (event: PointerEvent) => {
      if (pressedOutside && event.target === dialog && outside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Close open dropdown menus on outside click, Escape, or after choosing an item
  useEffect(() => {
    const closeAll = (except?: Node | null) => {
      document
        .querySelectorAll<HTMLDetailsElement>("details.menu-wrap[open]")
        .forEach((d) => {
          if (!except || !d.contains(except)) d.removeAttribute("open");
        });
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      closeAll(target);
      if (target?.closest(".panel") && target.closest("button[type=submit]")) {
        setTimeout(() => closeAll(), 0);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Cmd/Ctrl + K opens capture
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openCapture() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      setMode("quick");
      dialog.showModal();
      setTimeout(() => quickInputRef.current?.focus(), 20);
    }
  }

  function closeCapture() {
    dialogRef.current?.close();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const areaProjects = projects.filter((p) => p.lifeAreaId === areaId);

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main-content"
        className="visually-hidden focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:px-4 md:py-6">
        <Link href="/" className="px-3 text-xl font-bold tracking-tight">
          Orbit
        </Link>

        <button
          type="button"
          onClick={openCapture}
          className="button button-primary mt-6 w-full"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Capture</span>
        </button>

        <nav aria-label="Primary" className="mt-6">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="nav-link"
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.href === "/inbox" && unreviewedInboxCount > 0 && (
                      <span
                        className="count-badge tabular"
                        aria-label={`${unreviewedInboxCount} to review`}
                      >
                        {unreviewedInboxCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-label="Areas" className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <p className="meta-soft mb-1 px-3 font-medium">Areas</p>
          <ul className="space-y-1">
            {lifeAreas.map((area) => (
              <li key={area.id}>
                <Link
                  href={`/areas?area=${area.slug}`}
                  className="nav-link"
                >
                  <AreaDot token={area.colorToken} />
                  <span className="truncate">{area.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="mobile-bar md:hidden">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Orbit
          </Link>
          <button
            type="button"
            onClick={openCapture}
            className="button button-primary min-h-9 px-3.5"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Capture</span>
          </button>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pb-24 pt-5 outline-none sm:px-8 md:pb-16 md:pt-10"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Primary" className="tabbar md:hidden">
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="tab"
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.href === "/inbox" && unreviewedInboxCount > 0 && (
                    <span className="dot-badge tabular">
                      {unreviewedInboxCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Capture sheet */}
      <dialog
        ref={dialogRef}
        className="sheet"
        {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        aria-labelledby="capture-title"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="capture-title" className="h2">
              Capture
            </h2>
            <div className="flex items-center gap-2">
              <div className="segmented" role="group" aria-label="Capture mode">
                {(
                  [
                    ["quick", "Quick"],
                    ["detailed", "Detailed"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="segmented-item"
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={closeCapture}
                aria-label="Close"
                className="button button-ghost button-icon"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {mode === "quick" ? (
            <form
              action={async (formData) => {
                await quickCaptureAction(formData);
                closeCapture();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label htmlFor="quick-input" className="label">
                  Task or reminder
                </label>
                <input
                  ref={quickInputRef}
                  id="quick-input"
                  name="rawInput"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Call the Odoo developer tomorrow afternoon"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.nativeEvent.isComposing) {
                      e.preventDefault();
                    }
                  }}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="quick-area" className="label">
                  Area
                </label>
                <select
                  id="quick-area"
                  name="lifeAreaId"
                  defaultValue=""
                  className="field"
                >
                  <option value="">Detect automatically</option>
                  {lifeAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCapture}
                  className="button button-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  Add
                </button>
              </div>
            </form>
          ) : (
            <form
              action={async (formData) => {
                await createStructuredTaskAction(formData);
                closeCapture();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label htmlFor="d-title" className="label">
                  Title
                </label>
                <input
                  id="d-title"
                  name="title"
                  type="text"
                  required
                  autoComplete="off"
                  className="field"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="d-area" className="label">
                    Area
                  </label>
                  <select
                    id="d-area"
                    name="lifeAreaId"
                    value={areaId}
                    onChange={(e) => setAreaId(e.target.value)}
                    className="field"
                  >
                    {lifeAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="d-project" className="label">
                    Project
                  </label>
                  <select
                    id="d-project"
                    name="projectId"
                    defaultValue=""
                    className="field"
                  >
                    <option value="">None</option>
                    {areaProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend className="label">Type</legend>
                <div className="segmented w-full">
                  {(
                    [
                      ["FLEXIBLE", "Flexible"],
                      ["SCHEDULED", "Scheduled"],
                      ["WAITING", "Waiting"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="segmented-item flex-1"
                      aria-pressed={commitment === value}
                    >
                      <input
                        type="radio"
                        name="commitmentType"
                        value={value}
                        checked={commitment === value}
                        onChange={() => setCommitment(value)}
                        className="visually-hidden"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {commitment === "SCHEDULED" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="d-date" className="label">
                      Date
                    </label>
                    <input
                      id="d-date"
                      name="scheduledDate"
                      type="date"
                      required
                      className="field"
                    />
                  </div>
                  <div>
                    <label htmlFor="d-time" className="label">
                      Start time
                    </label>
                    <input
                      id="d-time"
                      name="scheduledTime"
                      type="time"
                      required
                      defaultValue="14:00"
                      className="field"
                    />
                  </div>
                </div>
              )}

              {commitment === "FLEXIBLE" && (
                <div>
                  <label htmlFor="d-window" className="label">
                    When
                  </label>
                  <select
                    id="d-window"
                    name="flexibilityWindow"
                    defaultValue="THIS_WEEK"
                    className="field"
                  >
                    <option value="THIS_MORNING">This morning</option>
                    <option value="THIS_AFTERNOON">This afternoon</option>
                    <option value="THIS_EVENING">This evening</option>
                    <option value="THIS_WEEK">This week</option>
                    <option value="WEEKEND">Weekend</option>
                  </select>
                </div>
              )}

              {commitment === "WAITING" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="d-who" className="label">
                      Waiting on
                    </label>
                    <input
                      id="d-who"
                      name="waitingOnPerson"
                      type="text"
                      className="field"
                    />
                  </div>
                  <div>
                    <label htmlFor="d-what" className="label">
                      For
                    </label>
                    <input
                      id="d-what"
                      name="waitingOnCondition"
                      type="text"
                      className="field"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="d-duration" className="label">
                    Minutes
                  </label>
                  <input
                    id="d-duration"
                    name="estimatedMinutes"
                    type="text"
                    inputMode="numeric"
                    defaultValue="45"
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="d-due" className="label">
                    Due date
                  </label>
                  <input id="d-due" name="dueDate" type="date" className="field" />
                </div>
                <div>
                  <label htmlFor="d-priority" className="label">
                    Priority
                  </label>
                  <select
                    id="d-priority"
                    name="priority"
                    defaultValue="NORMAL"
                    className="field"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCapture}
                  className="button button-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </div>
  );
}
