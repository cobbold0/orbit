"use client";

import React, {
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  GripVertical,
  Search,
  X,
} from "lucide-react";
import { reorderLifeAreasAction } from "@/app/actions/orbit-actions";
import { AreaIconBadge, Card } from "@/components/ui/page";
import {
  AreaActionsMenu,
  CreateAreaModal,
  type EditableAreaShape,
} from "@/components/modals/area-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface AreaCardItem extends EditableAreaShape {
  id: string;
  name: string;
  slug: string;
  colorToken: string;
  iconName: string | null;
  description: string | null;
  isArchived: boolean;
  projectCount: number;
  openTaskCount: number;
}

export function AreasOverviewClient({
  activeAreas,
  archivedAreas,
  totalProjectsCount,
  totalOpenTasksCount,
}: {
  activeAreas: AreaCardItem[];
  archivedAreas: AreaCardItem[];
  totalProjectsCount: number;
  totalOpenTasksCount: number;
}) {
  const searchId = useId();
  const { notify } = useOrbitToast();

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">(
    "active"
  );
  const [orderedActive, setOrderedActive] =
    useState<AreaCardItem[]>(activeAreas);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const dragSessionRef = useRef<{
    areaId: string;
    startX: number;
    startY: number;
    moved: boolean;
    initialIds: string[];
  } | null>(null);
  const orderedRef = useRef<AreaCardItem[]>(activeAreas);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOrderedActive(activeAreas);
    orderedRef.current = activeAreas;
  }, [activeAreas]);

  useEffect(() => {
    if (statusFilter === "archived" && archivedAreas.length === 0) {
      setStatusFilter("active");
    }
  }, [archivedAreas.length, statusFilter]);

  const q = query.trim().toLowerCase();
  const canReorder =
    mounted && statusFilter === "active" && !q && orderedActive.length > 1;

  const sourceList =
    statusFilter === "active" ? orderedActive : archivedAreas;

  const visibleAreas = q
    ? sourceList.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description?.toLowerCase().includes(q) ?? false)
      )
    : sourceList;

  function moveAreaInList(fromId: string, toId: string) {
    if (fromId === toId) return;
    setOrderedActive((prev) => {
      const fromIdx = prev.findIndex((a) => a.id === fromId);
      const toIdx = prev.findIndex((a) => a.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [movedItem] = next.splice(fromIdx, 1);
      if (!movedItem) return prev;
      next.splice(toIdx, 0, movedItem);
      orderedRef.current = next;
      return next;
    });
  }

  function persistOrderIfChanged(initialIds: string[]) {
    const finalIds = orderedRef.current.map((a) => a.id);
    const changed =
      finalIds.length === initialIds.length &&
      finalIds.some((id, idx) => id !== initialIds[idx]);
    if (!changed) return;

    startTransition(async () => {
      await reorderLifeAreasAction(finalIds);
      notify("Area order saved");
    });
  }

  function handleKeyboardMove(areaId: string, delta: -1 | 1) {
    const current = orderedRef.current;
    const idx = current.findIndex((a) => a.id === areaId);
    const targetIdx = idx + delta;
    if (idx === -1 || targetIdx < 0 || targetIdx >= current.length) return;

    const initialIds = current.map((a) => a.id);
    const target = current[targetIdx];
    if (!target) return;
    moveAreaInList(areaId, target.id);

    setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        `[data-drag-handle-id="${areaId}"]`
      );
      btn?.focus({ preventScroll: true });
      persistOrderIfChanged(initialIds);
    }, 0);
  }

  useEffect(() => {
    if (!draggingId) return;

    const onPointerMove = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const dist = Math.hypot(
        e.clientX - session.startX,
        e.clientY - session.startY
      );
      if (!session.moved && dist < 5) return;
      session.moved = true;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cardEl = el?.closest<HTMLElement>("[data-area-card-id]");
      const overId = cardEl?.dataset.areaCardId;
      if (overId && overId !== session.areaId) {
        moveAreaInList(session.areaId, overId);
      }
    };

    const finishDrag = () => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      setDraggingId(null);
      if (session?.moved) {
        persistOrderIfChanged(session.initialIds);
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", finishDrag);
    document.addEventListener("pointercancel", finishDrag);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", finishDrag);
      document.removeEventListener("pointercancel", finishDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId]);

  return (
    <div className="space-y-5">
      {/* Top compact summary boxes: Open tasks & Projects open dedicated screens */}
      <div
        aria-label="Areas summary"
        className="grid grid-cols-3 gap-2.5 sm:gap-4"
      >
        <button
          type="button"
          onClick={() => setStatusFilter("active")}
          className="card bg-base-200 text-start shadow-2xs transition-colors hover:bg-base-300/60"
        >
          <div className="card-body gap-1 p-3.5 sm:p-5">
            <span className="tabular text-2xl font-bold leading-none sm:text-3xl">
              {orderedActive.length}
            </span>
            <span className="text-[0.8125rem] font-medium text-[var(--text-2)] sm:text-[0.9375rem]">
              Active areas
            </span>
          </div>
        </button>

        <Link
          href="/areas/projects"
          className="card bg-base-200 shadow-2xs transition-colors hover:bg-base-300/60"
        >
          <div className="card-body gap-1 p-3.5 sm:p-5">
            <div className="flex items-center justify-between gap-1">
              <span className="tabular text-2xl font-bold leading-none sm:text-3xl">
                {totalProjectsCount}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[var(--text-3)]"
                aria-hidden="true"
              />
            </div>
            <span className="text-[0.8125rem] font-medium text-[var(--text-2)] sm:text-[0.9375rem]">
              Projects
            </span>
          </div>
        </Link>

        <Link
          href="/areas/tasks"
          className="card bg-base-200 shadow-2xs transition-colors hover:bg-base-300/60"
        >
          <div className="card-body gap-1 p-3.5 sm:p-5">
            <div className="flex items-center justify-between gap-1">
              <span className="tabular text-2xl font-bold leading-none sm:text-3xl">
                {totalOpenTasksCount}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[var(--text-3)]"
                aria-hidden="true"
              />
            </div>
            <span className="text-[0.8125rem] font-medium text-[var(--text-2)] sm:text-[0.9375rem]">
              Open tasks
            </span>
          </div>
        </Link>
      </div>

      {/* Search + Active/Archived filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <search
          aria-label="Search life areas"
          className="min-w-[12rem] flex-1 sm:max-w-xs"
        >
          <label htmlFor={searchId} className="visually-hidden">
            Search areas
          </label>
          <label className="input flex w-full items-center gap-2">
            <Search className="h-4 w-4 opacity-60" aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search areas"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="grow"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="btn btn-ghost btn-xs btn-circle"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </label>
        </search>

        {archivedAreas.length > 0 && (
          <div
            role="tablist"
            aria-label="Area status"
            className="tabs tabs-box tabs-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "active"}
              onClick={() => setStatusFilter("active")}
              className={`tab font-medium ${
                statusFilter === "active" ? "tab-active" : ""
              }`}
            >
              Active ({orderedActive.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "archived"}
              onClick={() => setStatusFilter("archived")}
              className={`tab font-medium ${
                statusFilter === "archived" ? "tab-active" : ""
              }`}
            >
              Archived ({archivedAreas.length})
            </button>
          </div>
        )}
      </div>

      {/* Life Area Cubes / Cards Grid */}
      {visibleAreas.length === 0 ? (
        <Card
          title={
            q
              ? "No matching areas"
              : statusFilter === "archived"
                ? "No archived areas"
                : "No areas yet"
          }
        >
          <div className="orbit-row">
            <p className="meta orbit-row-main">
              {q
                ? "Try a different search term."
                : "Create an area to group related projects, tasks, and routines."}
            </p>
            {!q && statusFilter === "active" && (
              <CreateAreaModal triggerClassName="btn btn-secondary btn-sm" />
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleAreas.map((area) => {
            const isDragging = draggingId === area.id;
            return (
              <article
                key={area.id}
                data-area-card-id={area.id}
                className={`card bg-base-200 shadow-2xs transition-shadow ${
                  isDragging ? "ring-2 ring-base-content/30 shadow-md" : ""
                }`}
              >
                <div className="card-body justify-between gap-3 p-4 sm:p-5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        {canReorder && (
                          <button
                            type="button"
                            data-drag-handle-id={area.id}
                            aria-label={`Reorder ${area.name}, use arrow keys to move`}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              dragSessionRef.current = {
                                areaId: area.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                moved: false,
                                initialIds: orderedRef.current.map((a) => a.id),
                              };
                              setDraggingId(area.id);
                            }}
                            onKeyDown={(e) => {
                              if (
                                e.key === "ArrowUp" ||
                                e.key === "ArrowLeft"
                              ) {
                                e.preventDefault();
                                handleKeyboardMove(area.id, -1);
                              } else if (
                                e.key === "ArrowDown" ||
                                e.key === "ArrowRight"
                              ) {
                                e.preventDefault();
                                handleKeyboardMove(area.id, 1);
                              }
                            }}
                            className={`drag-handle -ms-1.5 inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-base-300/70 hover:text-base-content ${
                              isDragging ? "dragging text-base-content" : ""
                            }`}
                          >
                            <GripVertical
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </button>
                        )}

                        <Link
                          href={`/areas/${area.slug}`}
                          className="flex min-w-0 flex-1 items-center gap-3 group"
                        >
                          <AreaIconBadge
                            iconName={area.iconName}
                            token={area.colorToken}
                          />
                          <h2 className="h2 truncate group-hover:underline">
                            {area.name}
                          </h2>
                        </Link>
                      </div>

                      <AreaActionsMenu area={area} />
                    </div>

                    {area.description && (
                      <p className="meta mt-2.5 line-clamp-2">
                        {area.description}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/areas/${area.slug}`}
                    aria-label={`Open ${area.name}: ${area.projectCount} projects, ${area.openTaskCount} open tasks`}
                    className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--divider)] pt-3 text-[0.9375rem] text-[var(--text-2)] hover:text-base-content"
                  >
                    <span className="tabular">
                      {area.projectCount}{" "}
                      {area.projectCount === 1 ? "project" : "projects"} &middot;{" "}
                      {area.openTaskCount} open{" "}
                      {area.openTaskCount === 1 ? "task" : "tasks"}
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
