"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AreaLabel, Card, PageHeader } from "@/components/ui/page";
import {
  EditExtractedActionModal,
  MemoryCaptureModal,
} from "@/components/inbox/memory-capture-studio";
import {
  approveAllActionableInboxAction,
  resolveExtractedActionAction,
} from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface NoteExtractedItem {
  id: string;
  title: string;
  lifeAreaId: string | null;
  classification: string;
  classificationLabel: string;
  isActionable: boolean;
  sourceQuote: string | null;
  waitingOnTarget: string | null;
  suggestedCommitment: string;
  reviewStatus: string;
  lifeArea: {
    name: string;
    slug: string;
    colorToken: string;
  } | null;
}

export interface SavedNoteItem {
  id: string;
  title: string;
  kindLabel: string;
  whenLabel: string;
  speakerContext: string | null;
  rawContent: string;
  extractedActions: NoteExtractedItem[];
}

export function NotesClient({
  entries,
  areaOptions,
  pendingTotal,
}: {
  entries: SavedNoteItem[];
  areaOptions: { id: string; name: string }[];
  pendingTotal: number;
}) {
  const [tab, setTab] = useState<"review" | "notes">(
    pendingTotal > 0 ? "review" : "notes"
  );
  const { notify } = useOrbitToast();

  const entriesWithPending = entries.filter((e) =>
    e.extractedActions.some((a) => a.reviewStatus === "PENDING_REVIEW")
  );

  return (
    <div className="page">
      <PageHeader title="Notes">
        <MemoryCaptureModal />
      </PageHeader>

      <div className="space-y-2">
        <div
          role="tablist"
          aria-label="Notes view"
          className="tabs tabs-box tabs-sm w-full sm:w-auto sm:inline-flex"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "review"}
            onClick={() => setTab("review")}
            className={`tab flex-1 gap-2 font-medium sm:flex-initial sm:px-5 ${
              tab === "review" ? "tab-active" : ""
            }`}
          >
            <span>To review</span>
            <span
              className={`badge badge-xs tabular ${
                pendingTotal > 0 ? "badge-neutral" : "badge-ghost"
              }`}
            >
              {pendingTotal}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "notes"}
            onClick={() => setTab("notes")}
            className={`tab flex-1 font-medium sm:flex-initial sm:px-5 ${
              tab === "notes" ? "tab-active" : ""
            }`}
          >
            Saved notes ({entries.length})
          </button>
        </div>

        <p className="meta">
          {tab === "review"
            ? "Tasks Orbit spotted inside your notes. Nothing is added until you approve."
            : "Your captured notes, meeting transcripts, and voice memos."}
        </p>
      </div>

      {tab === "review" ? (
        entriesWithPending.length === 0 ? (
          <Card title="All caught up">
            <div className="orbit-row">
              <p className="meta orbit-row-main">
                {entries.length === 0
                  ? "Save a meeting note, message, or voice memo and Orbit will pull out tasks for you to review."
                  : "Every task spotted in your notes has been reviewed."}
              </p>
              {entries.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setTab("notes")}
                  className="btn btn-secondary btn-sm"
                >
                  View saved notes
                </button>
              ) : (
                <MemoryCaptureModal
                  triggerLabel="New note"
                  triggerClassName="btn btn-secondary btn-sm"
                />
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-5">
            {entriesWithPending.map((entry) => {
              const pendingItems = entry.extractedActions.filter(
                (a) => a.reviewStatus === "PENDING_REVIEW"
              );
              const actionablePendingCount = pendingItems.filter(
                (a) => a.isActionable
              ).length;

              return (
                <Card
                  key={entry.id}
                  title={entry.title}
                  action={
                    actionablePendingCount > 1 ? (
                      <form
                        action={async (fd) => {
                          await approveAllActionableInboxAction(fd);
                          notify("Tasks approved");
                        }}
                      >
                        <input
                          type="hidden"
                          name="inboxEntryId"
                          value={entry.id}
                        />
                        <button type="submit" className="btn btn-primary btn-sm">
                          <Check className="h-4 w-4" aria-hidden="true" />
                          <span>Approve all ({actionablePendingCount})</span>
                        </button>
                      </form>
                    ) : undefined
                  }
                >
                  <p className="meta">
                    {entry.kindLabel}, {entry.whenLabel}
                    {entry.speakerContext ? `, ${entry.speakerContext}` : ""}
                  </p>

                  <details className="mt-2">
                    <summary className="meta cursor-pointer font-medium underline underline-offset-4">
                      Read note
                    </summary>
                    <p className="mt-2 whitespace-pre-line text-[0.9375rem] text-[var(--text-2)]">
                      {entry.rawContent}
                    </p>
                  </details>

                  <div className="mt-3">
                    {pendingItems.map((item) => (
                      <div key={item.id} className="orbit-row">
                        <div className="orbit-row-main">
                          <p className="title">{item.title}</p>
                          <p className="meta flex flex-wrap items-center gap-x-3">
                            {item.lifeArea && (
                              <Link
                                href={`/areas/${item.lifeArea.slug}`}
                                className="hover:underline"
                              >
                                <AreaLabel
                                  name={item.lifeArea.name}
                                  token={item.lifeArea.colorToken}
                                />
                              </Link>
                            )}
                            <span>{item.classificationLabel}</span>
                          </p>
                          {item.sourceQuote && (
                            <p className="meta-soft mt-1">
                              &ldquo;{item.sourceQuote}&rdquo;
                            </p>
                          )}
                        </div>

                        <div className="orbit-row-actions">
                          {item.isActionable && (
                            <EditExtractedActionModal
                              item={item}
                              lifeAreas={areaOptions}
                            />
                          )}
                          <form
                            action={async (fd) => {
                              const dec = String(fd.get("decision") ?? "");
                              await resolveExtractedActionAction(fd);
                              notify(
                                dec === "APPROVE"
                                  ? "Added to tasks"
                                  : "Dismissed"
                              );
                            }}
                            className="inline-flex items-center gap-1.5"
                          >
                            <input
                              type="hidden"
                              name="extractedActionId"
                              value={item.id}
                            />
                            <button
                              type="submit"
                              name="decision"
                              value="APPROVE"
                              aria-label={`Approve ${item.title}`}
                              className={
                                item.isActionable
                                  ? "btn btn-primary btn-sm"
                                  : "btn btn-secondary btn-sm"
                              }
                            >
                              {item.classification === "ALREADY_COMPLETED"
                                ? "Log work"
                                : item.isActionable
                                  ? "Approve"
                                  : "Add task"}
                            </button>
                            <button
                              type="submit"
                              name="decision"
                              value="DISMISS"
                              aria-label={`Dismiss ${item.title}`}
                              className="btn btn-ghost btn-sm"
                            >
                              Dismiss
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : entries.length === 0 ? (
        <Card title="No saved notes yet">
          <div className="orbit-row">
            <p className="meta orbit-row-main">
              Capture meeting notes, voice memos, or quick thoughts here.
            </p>
            <MemoryCaptureModal
              triggerLabel="New note"
              triggerClassName="btn btn-secondary btn-sm"
            />
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const approvedCount = entry.extractedActions.filter(
              (a) => a.reviewStatus === "APPROVED"
            ).length;
            const pendingCount = entry.extractedActions.filter(
              (a) => a.reviewStatus === "PENDING_REVIEW"
            ).length;

            return (
              <Card key={entry.id} title={entry.title}>
                <p className="meta flex flex-wrap items-center gap-x-3">
                  <span>
                    {entry.kindLabel}, {entry.whenLabel}
                  </span>
                  {entry.speakerContext && <span>{entry.speakerContext}</span>}
                  {approvedCount > 0 && (
                    <span>
                      {approvedCount} {approvedCount === 1 ? "task" : "tasks"}{" "}
                      added
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setTab("review")}
                      className="font-semibold text-base-content underline underline-offset-4"
                    >
                      {pendingCount} to review
                    </button>
                  )}
                </p>

                <p className="mt-3 whitespace-pre-line text-[0.9375rem] text-[var(--text-2)]">
                  {entry.rawContent}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
