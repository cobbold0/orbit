"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Search, X } from "lucide-react";
import { AreaDot } from "@/components/ui/page";

export interface FilterableAreaItem {
  id: string;
  name: string;
  slug: string;
  colorToken: string;
  openTaskCount: number;
}

export function AreaFilterBar({
  areas,
  selectedSlug,
  query,
  onQueryChange,
  basePath = "/areas/tasks",
  searchPlaceholder = "Search",
}: {
  areas: FilterableAreaItem[];
  selectedSlug?: string;
  query: string;
  onQueryChange: (next: string) => void;
  basePath?: string;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const searchInputId = useId();
  const areaSearchId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const areaFilterInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");

  const selectedArea = areas.find((a) => a.slug === selectedSlug);

  const matchingAreas = areaQuery.trim()
    ? areas.filter((a) =>
        a.name.toLowerCase().includes(areaQuery.trim().toLowerCase())
      )
    : areas;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectArea(slug?: string) {
    setOpen(false);
    setAreaQuery("");
    if (!slug) {
      router.push(basePath);
    } else {
      router.push(`${basePath}?area=${encodeURIComponent(slug)}`);
    }
  }

  return (
    <search
      aria-label="Filter areas, projects, and tasks"
      className="flex flex-wrap items-center gap-2.5"
    >
      {/* Searchable Area Combobox */}
      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) {
              setTimeout(() => areaFilterInputRef.current?.focus(), 20);
            }
          }}
          className="btn btn-secondary justify-between gap-2.5"
        >
          {selectedArea ? (
            <span className="inline-flex items-center gap-2">
              <AreaDot token={selectedArea.colorToken} />
              <span className="max-w-44 truncate">{selectedArea.name}</span>
            </span>
          ) : (
            <span>All areas ({areas.length})</span>
          )}
          <ChevronDown className="h-4 w-4 opacity-70" aria-hidden="true" />
        </button>

        {open && (
          <div className="bg-base-100 border-base-300 absolute start-0 top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-xl">
            <div className="p-1">
              <label htmlFor={areaSearchId} className="visually-hidden">
                Find an area
              </label>
              <label className="input input-sm flex w-full items-center gap-2">
                <Search className="h-4 w-4 opacity-60" aria-hidden="true" />
                <input
                  ref={areaFilterInputRef}
                  id={areaSearchId}
                  type="search"
                  value={areaQuery}
                  onChange={(e) => setAreaQuery(e.target.value)}
                  placeholder="Find an area"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="grow"
                />
              </label>
            </div>

            <ul
              role="listbox"
              aria-label="Areas"
              className="menu flex-nowrap w-full max-h-64 overflow-y-auto p-1"
            >
              {!areaQuery.trim() && (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!selectedArea}
                    onClick={() => selectArea(undefined)}
                    className={!selectedArea ? "menu-active" : ""}
                  >
                    <span className="font-medium">All areas</span>
                    {!selectedArea && (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </li>
              )}

              {matchingAreas.length === 0 ? (
                <li className="px-3 py-2 text-sm text-[var(--text-3)]">
                  No matching areas
                </li>
              ) : (
                matchingAreas.map((area) => {
                  const active = selectedArea?.id === area.id;
                  return (
                    <li key={area.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => selectArea(area.slug)}
                        className={active ? "menu-active" : ""}
                      >
                        <AreaDot token={area.colorToken} />
                        <span className="truncate">{area.name}</span>
                        <span className="tabular text-xs opacity-70">
                          {area.openTaskCount}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>

      {selectedArea && (
        <>
          <button
            type="button"
            onClick={() => selectArea(undefined)}
            aria-label={`Clear ${selectedArea.name} filter`}
            className="btn btn-ghost btn-sm"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Clear filter</span>
          </button>

          <Link
            href={`/areas/${selectedArea.slug}`}
            className="btn btn-ghost btn-sm"
          >
            <span>Open {selectedArea.name}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </>
      )}

      {/* Text filter */}
      <div className="min-w-[12rem] flex-1 sm:max-w-xs sm:ms-auto">
        <label htmlFor={searchInputId} className="visually-hidden">
          {searchPlaceholder}
        </label>
        <label className="input flex w-full items-center gap-2">
          <Search className="h-4 w-4 opacity-60" aria-hidden="true" />
          <input
            id={searchInputId}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="grow"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search text"
              className="btn btn-ghost btn-xs btn-circle"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
      </div>
    </search>
  );
}
