"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  CalendarRange,
  FileText,
  History,
  Layers,
  LogOut,
  MoreVertical,
  Plus,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { signOut } from "@/lib/auth/auth-client";
import {
  createStructuredTaskAction,
  logActivityCheckInAction,
  quickCaptureAction,
} from "@/app/actions/orbit-actions";
import { MemoryCaptureForm } from "@/components/inbox/memory-capture-studio";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";
import { ExpandableFab } from "./expandable-fab";
import { QuickVoiceDialog } from "./quick-voice-dialog";
import { PwaInstallBanner } from "./pwa-install-banner";

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

export type CaptureTabMode = "task" | "note" | "log";

interface OpenCaptureOptions {
  defaultAreaId?: string;
  mode?: CaptureTabMode | "quick" | "detailed";
}

interface OrbitCaptureContextValue {
  openCapture: (options?: OpenCaptureOptions) => void;
}

const OrbitCaptureContext = createContext<OrbitCaptureContextValue>({
  openCapture: () => {},
});

export function useOrbitCapture() {
  return useContext(OrbitCaptureContext);
}

export function OpenCaptureButton({
  defaultAreaId,
  mode = "task",
  label = "New task",
  className = "btn btn-secondary",
}: {
  defaultAreaId?: string;
  mode?: CaptureTabMode | "quick" | "detailed";
  label?: string;
  className?: string;
}) {
  const { openCapture } = useOrbitCapture();
  return (
    <button
      type="button"
      onClick={() => openCapture({ defaultAreaId, mode })}
      className={className}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export interface ShellUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface OrbitShellProps {
  children: React.ReactNode;
  lifeAreas: ShellLifeArea[];
  projects: ShellProject[];
  unreviewedInboxCount?: number;
  unreadCheckInCount?: number;
  user?: ShellUser | null;
}

const NAV_ITEMS = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/areas", label: "Areas", icon: Layers },
  { href: "/routines", label: "Activity", icon: History },
  { href: "/inbox", label: "Notes", icon: FileText },
];

type CommitmentChoice = "FLEXIBLE" | "SCHEDULED" | "WAITING";

export function OrbitShell({
  children,
  lifeAreas,
  projects,
  unreviewedInboxCount = 0,
  unreadCheckInCount = 0,
  user = null,
}: OrbitShellProps) {
  const pathname = usePathname();
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const logTitleRef = useRef<HTMLInputElement | null>(null);
  const taskFormRef = useRef<HTMLFormElement | null>(null);
  const logFormRef = useRef<HTMLFormElement | null>(null);
  const { notify } = useOrbitToast();

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      window.location.href = "/sign-in";
    }
  }

  const [tab, setTab] = useState<CaptureTabMode>("task");
  const [showMoreTaskOptions, setShowMoreTaskOptions] = useState(false);
  const [commitment, setCommitment] = useState<CommitmentChoice>("FLEXIBLE");
  const [areaId, setAreaId] = useState<string>("");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);

  const openCapture = useCallback(
    (options?: OpenCaptureOptions) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const requested = options?.mode ?? "task";
      const nextTab: CaptureTabMode =
        requested === "note" ? "note" : requested === "log" ? "log" : "task";
      setTab(nextTab);
      setShowMoreTaskOptions(requested === "detailed");

      if (options?.defaultAreaId) {
        setAreaId(options.defaultAreaId);
      } else {
        setAreaId("");
      }

      if (!dialog.open) {
        dialog.showModal();
      }
      setTimeout(() => {
        if (nextTab === "task") {
          taskInputRef.current?.focus();
        } else if (nextTab === "note") {
          noteTextareaRef.current?.focus();
        } else {
          logTitleRef.current?.focus();
        }
      }, 20);
    },
    []
  );

  function closeCapture() {
    dialogRef.current?.close();
  }

  // Cmd/Ctrl + K opens Capture
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCapture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCapture]);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const effectiveStructuredAreaId = areaId || lifeAreas[0]?.id || "";
  const areaProjects = projects.filter(
    (p) => p.lifeAreaId === effectiveStructuredAreaId
  );

  return (
    <OrbitCaptureContext.Provider value={{ openCapture }}>
      <div className="min-h-dvh md:flex">
        <a
          href="#main-content"
          className="visually-hidden focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-base-100 focus:px-4 focus:py-2 focus:shadow-lg"
        >
          Skip to main content
        </a>

        {/* Desktop sidebar: 5 primary destinations */}
        <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-base-300/70 md:px-4 md:py-6">
          <Link href="/" className="px-3 text-xl font-bold tracking-tight">
            Orbit
          </Link>

          <nav aria-label="Primary" className="mt-8">
            <ul className="menu flex-nowrap w-full gap-1 p-0 text-[0.9375rem]">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`py-2.5 font-medium ${active ? "menu-active" : ""}`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.href === "/inbox" && unreviewedInboxCount > 0 && (
                        <span
                          className={`badge badge-sm tabular ${
                            active ? "badge-secondary" : "badge-neutral"
                          }`}
                          aria-label={`${unreviewedInboxCount} tasks to review`}
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

          <div className="mt-auto border-t border-base-300/70 pt-3">
            {user && (
              <div className="dropdown dropdown-top w-full">
                <div
                  tabIndex={0}
                  role="button"
                  className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-base-200/60 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                    {user.name ? user.name.slice(0, 2).toUpperCase() : "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight text-base-content">
                      {user.name || "User"}
                    </p>
                    <p className="truncate text-xs text-base-content/60 leading-tight">
                      {user.email || ""}
                    </p>
                  </div>
                  <MoreVertical className="h-4 w-4 shrink-0 text-base-content/40" />
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu z-30 mb-2 w-56 rounded-box bg-base-100 p-1.5 shadow-md border border-base-300/70 text-sm"
                >
                  <li>
                    <Link
                      href="/settings"
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        <span>Settings</span>
                      </div>
                      {unreadCheckInCount > 0 && (
                        <span className="badge badge-sm badge-secondary tabular">
                          {unreadCheckInCount}
                        </span>
                      )}
                    </Link>
                  </li>
                  <li>
                    <Link href="/settings?tab=account">
                      <User className="h-4 w-4" />
                      <span>Account details</span>
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="text-error hover:bg-error/10"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top navbar */}
          <header className="navbar sticky top-0 z-20 min-h-14 border-b border-base-300/70 bg-base-100/95 px-4 backdrop-blur md:hidden">
            <div className="navbar-start">
              <Link href="/" className="text-lg font-bold tracking-tight">
                Orbit
              </Link>
            </div>
            <div className="navbar-end">
              {user && (
                <Link
                  href="/settings?tab=account"
                  aria-label="Account details"
                  className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                >
                  {user.name ? user.name.slice(0, 2).toUpperCase() : "U"}
                  {unreadCheckInCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-base-100" />
                  )}
                </Link>
              )}
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pb-24 pt-5 outline-none sm:px-8 md:pb-16 md:pt-10"
          >
            <PwaInstallBanner />
            {children}
          </main>
        </div>

        {/* Mobile bottom DaisyUI dock */}
        <nav
          aria-label="Mobile primary"
          className="dock dock-md z-30 border-t border-base-300/80 bg-base-100/95 backdrop-blur md:hidden"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const hasBadge =
              item.href === "/inbox" && unreviewedInboxCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "dock-active" : ""}
              >
                {hasBadge ? (
                  <span className="indicator">
                    <span className="indicator-item badge badge-neutral badge-xs tabular">
                      {unreviewedInboxCount}
                    </span>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" aria-hidden="true" />
                )}
                <span className="dock-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Unified Capture Modal: Task (to do) | Note (brain dump / voice) | Log work (done) */}
        <OrbitModal
          dialogRef={dialogRef}
          title="Capture"
          maxWidthClass="sm:max-w-lg"
        >
          <div
            role="tablist"
            aria-label="What are you capturing?"
            className="tabs tabs-box tabs-sm mb-3 w-full"
          >
            {(
              [
                ["task", "Task"],
                ["note", "Note"],
                ["log", "Log work"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`tab flex-1 font-medium ${
                  tab === value ? "tab-active" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "task" && (
            <form
              ref={taskFormRef}
              action={async (formData) => {
                if (showMoreTaskOptions) {
                  const raw = String(formData.get("rawInput") ?? "").trim();
                  formData.set("title", raw);
                  if (!formData.get("lifeAreaId") && effectiveStructuredAreaId) {
                    formData.set("lifeAreaId", effectiveStructuredAreaId);
                  }
                  await createStructuredTaskAction(formData);
                } else {
                  await quickCaptureAction(formData);
                }
                taskFormRef.current?.reset();
                setShowMoreTaskOptions(false);
                closeCapture();
                notify("Task added");
              }}
              className="space-y-3"
            >
              <p className="meta">
                Something you need to do. Type naturally or add scheduling
                details below.
              </p>

              <fieldset className="fieldset">
                <label
                  htmlFor={`${idBase}-task-input`}
                  className="fieldset-legend"
                >
                  Task
                </label>
                <input
                  ref={taskInputRef}
                  id={`${idBase}-task-input`}
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
                  className="input w-full"
                />
              </fieldset>

              <fieldset className="fieldset">
                <label
                  htmlFor={`${idBase}-task-area`}
                  className="fieldset-legend"
                >
                  Area
                </label>
                <select
                  id={`${idBase}-task-area`}
                  name="lifeAreaId"
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  className="select w-full"
                >
                  {!showMoreTaskOptions && (
                    <option value="">Detect automatically</option>
                  )}
                  {lifeAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </fieldset>

              <details
                open={showMoreTaskOptions}
                onToggle={(e) =>
                  setShowMoreTaskOptions(
                    (e.currentTarget as HTMLDetailsElement).open
                  )
                }
                className="rounded-xl border border-base-300 bg-base-200/50 px-3.5 py-2.5"
              >
                <summary className="cursor-pointer text-[0.9375rem] font-medium text-[var(--text-2)]">
                  Schedule, project, or priority
                </summary>

                <div className="mt-3 space-y-3">
                  <fieldset className="fieldset">
                    <label
                      htmlFor={`${idBase}-d-project`}
                      className="fieldset-legend"
                    >
                      Project
                    </label>
                    <select
                      id={`${idBase}-d-project`}
                      name="projectId"
                      defaultValue=""
                      className="select w-full"
                    >
                      <option value="">None</option>
                      {areaProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </fieldset>

                  <fieldset className="fieldset">
                    <legend className="fieldset-legend">Type</legend>
                    <div className="tabs tabs-box w-full">
                      {(
                        [
                          ["FLEXIBLE", "Flexible"],
                          ["SCHEDULED", "Scheduled"],
                          ["WAITING", "Waiting"],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="tab flex-1 font-medium">
                          <input
                            type="radio"
                            name="commitmentType"
                            value={value}
                            checked={commitment === value}
                            onChange={() => setCommitment(value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {commitment === "SCHEDULED" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <fieldset className="fieldset">
                        <label
                          htmlFor={`${idBase}-d-date`}
                          className="fieldset-legend"
                        >
                          Date
                        </label>
                        <input
                          id={`${idBase}-d-date`}
                          name="scheduledDate"
                          type="date"
                          required={showMoreTaskOptions}
                          className="input w-full"
                        />
                      </fieldset>
                      <fieldset className="fieldset">
                        <label
                          htmlFor={`${idBase}-d-time`}
                          className="fieldset-legend"
                        >
                          Start time
                        </label>
                        <input
                          id={`${idBase}-d-time`}
                          name="scheduledTime"
                          type="time"
                          required={showMoreTaskOptions}
                          defaultValue="14:00"
                          className="input w-full"
                        />
                      </fieldset>
                    </div>
                  )}

                  {commitment === "FLEXIBLE" && (
                    <fieldset className="fieldset">
                      <label
                        htmlFor={`${idBase}-d-window`}
                        className="fieldset-legend"
                      >
                        When
                      </label>
                      <select
                        id={`${idBase}-d-window`}
                        name="flexibilityWindow"
                        defaultValue="THIS_WEEK"
                        className="select w-full"
                      >
                        <option value="THIS_MORNING">This morning</option>
                        <option value="THIS_AFTERNOON">This afternoon</option>
                        <option value="THIS_EVENING">This evening</option>
                        <option value="THIS_WEEK">This week</option>
                        <option value="WEEKEND">Weekend</option>
                      </select>
                    </fieldset>
                  )}

                  {commitment === "WAITING" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <fieldset className="fieldset">
                        <label
                          htmlFor={`${idBase}-d-who`}
                          className="fieldset-legend"
                        >
                          Waiting on
                        </label>
                        <input
                          id={`${idBase}-d-who`}
                          name="waitingOnPerson"
                          type="text"
                          className="input w-full"
                        />
                      </fieldset>
                      <fieldset className="fieldset">
                        <label
                          htmlFor={`${idBase}-d-what`}
                          className="fieldset-legend"
                        >
                          For
                        </label>
                        <input
                          id={`${idBase}-d-what`}
                          name="waitingOnCondition"
                          type="text"
                          className="input w-full"
                        />
                      </fieldset>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <fieldset className="fieldset">
                      <label
                        htmlFor={`${idBase}-d-duration`}
                        className="fieldset-legend"
                      >
                        Minutes
                      </label>
                      <input
                        id={`${idBase}-d-duration`}
                        name="estimatedMinutes"
                        type="text"
                        inputMode="numeric"
                        defaultValue="45"
                        className="input w-full"
                      />
                    </fieldset>
                    <fieldset className="fieldset">
                      <label
                        htmlFor={`${idBase}-d-due`}
                        className="fieldset-legend"
                      >
                        Due date
                      </label>
                      <input
                        id={`${idBase}-d-due`}
                        name="dueDate"
                        type="date"
                        className="input w-full"
                      />
                    </fieldset>
                    <fieldset className="fieldset">
                      <label
                        htmlFor={`${idBase}-d-priority`}
                        className="fieldset-legend"
                      >
                        Priority
                      </label>
                      <select
                        id={`${idBase}-d-priority`}
                        name="priority"
                        defaultValue="NORMAL"
                        className="select w-full"
                      >
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </fieldset>
                  </div>
                </div>
              </details>

              <div className="modal-action">
                <button
                  type="button"
                  onClick={closeCapture}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Adding">Add task</SubmitButton>
              </div>
            </form>
          )}

          {tab === "note" && (
            <MemoryCaptureForm
              textareaRef={noteTextareaRef}
              onSuccess={closeCapture}
              onCancel={closeCapture}
            />
          )}

          {tab === "log" && (
            <form
              ref={logFormRef}
              action={async (formData) => {
                await logActivityCheckInAction(formData);
                logFormRef.current?.reset();
                closeCapture();
                notify("Work logged");
              }}
              className="space-y-3"
            >
              <p className="meta">
                Record something you already spent time on. Saved directly to
                your Activity work log.
              </p>

              <fieldset className="fieldset">
                <label
                  htmlFor={`${idBase}-log-title`}
                  className="fieldset-legend"
                >
                  What did you work on?
                </label>
                <input
                  ref={logTitleRef}
                  id={`${idBase}-log-title`}
                  name="title"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Vocal warmups, Odoo sprint review"
                  className="input w-full"
                />
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="fieldset">
                  <label
                    htmlFor={`${idBase}-log-area`}
                    className="fieldset-legend"
                  >
                    Area
                  </label>
                  <select
                    id={`${idBase}-log-area`}
                    name="lifeAreaId"
                    defaultValue={areaId || lifeAreas[0]?.id || ""}
                    className="select w-full"
                  >
                    {lifeAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </fieldset>

                <fieldset className="fieldset">
                  <label
                    htmlFor={`${idBase}-log-min`}
                    className="fieldset-legend"
                  >
                    Duration in minutes
                  </label>
                  <input
                    id={`${idBase}-log-min`}
                    name="durationMinutes"
                    type="text"
                    inputMode="numeric"
                    defaultValue="45"
                    className="input w-full"
                  />
                </fieldset>
              </div>

              <fieldset className="fieldset">
                <label
                  htmlFor={`${idBase}-log-loc`}
                  className="fieldset-legend"
                >
                  Location (optional)
                </label>
                <input
                  id={`${idBase}-log-loc`}
                  name="physicalLocation"
                  type="text"
                  autoComplete="off"
                  placeholder="Basilissa Office, Home"
                  className="input w-full"
                />
              </fieldset>

              <div className="modal-action">
                <button
                  type="button"
                  onClick={closeCapture}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Saving">Save to log</SubmitButton>
              </div>
            </form>
          )}
        </OrbitModal>

        {/* Expandable Speed-Dial FAB for Quick Actions (Voice, Task, Note, Work Log) */}
        <ExpandableFab
          onOpenCapture={(m) => openCapture({ mode: m })}
          onOpenVoice={() => setIsVoiceOpen(true)}
        />

        {/* Floating Quick Voice AI Dialog */}
        <QuickVoiceDialog
          isOpen={isVoiceOpen}
          onClose={() => setIsVoiceOpen(false)}
        />
      </div>
    </OrbitCaptureContext.Provider>
  );
}
