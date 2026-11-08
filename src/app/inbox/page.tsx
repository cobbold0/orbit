import { Check } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { MemoryCaptureStudio } from "@/components/inbox/memory-capture-studio";
import { AreaLabel, Dropdown, PageHeader } from "@/components/ui/page";
import {
  CAPTURE_KIND_LABEL,
  CLASSIFICATION_LABEL,
  formatClock,
  formatShortDate,
} from "@/lib/time/format";
import {
  approveAllActionableInboxAction,
  resolveExtractedActionAction,
} from "@/app/actions/orbit-actions";

export const dynamic = "force-dynamic";

const ACTIONABLE = [
  "AGREED_TO_DO",
  "ASSIGNED_TO_USER",
  "FOLLOW_UP",
  "DEADLINE_MENTION",
];

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [pref, lifeAreas, projects, entries] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.lifeArea.findMany({
      where: { userId: user.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.project.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, title: true, lifeAreaId: true },
    }),
    prisma.memoryInboxEntry.findMany({
      where: { userId: user.id },
      include: {
        extractedActions: {
          include: { lifeArea: true, materializedTask: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const tz = pref?.ianaTimeZone ?? "Africa/Lagos";
  const pendingTotal = entries.reduce(
    (sum, e) =>
      sum + e.extractedActions.filter((a) => a.reviewStatus === "PENDING_REVIEW").length,
    0
  );

  return (
    <OrbitShell
      lifeAreas={lifeAreas}
      projects={projects}
      unreviewedInboxCount={pendingTotal}
    >
      <div className="page">
        <PageHeader title="Inbox" />

        <MemoryCaptureStudio />

        {entries.length === 0 && <p className="meta">No notes yet.</p>}

        {entries.map((entry) => {
          const actionable = entry.extractedActions.filter((a) =>
            ACTIONABLE.includes(a.classification)
          );
          const others = entry.extractedActions.filter(
            (a) => !ACTIONABLE.includes(a.classification)
          );
          const pending = actionable.filter((a) => a.reviewStatus === "PENDING_REVIEW");

          return (
            <article key={entry.id} className="card">
              <div className="card-head">
                <div className="min-w-0">
                  <h2 className="h2">{entry.title ?? "Captured note"}</h2>
                  <p className="meta">
                    {CAPTURE_KIND_LABEL[entry.captureKind] ?? "Note"},{" "}
                    {formatShortDate(entry.createdAt, tz)}{" "}
                    {formatClock(entry.createdAt, tz)}
                    {entry.speakerContext ? `, ${entry.speakerContext}` : ""}
                  </p>
                </div>
                {pending.length > 0 && (
                  <form action={approveAllActionableInboxAction}>
                    <input type="hidden" name="inboxEntryId" value={entry.id} />
                    <button type="submit" className="button button-primary">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span>Approve all ({pending.length})</span>
                    </button>
                  </form>
                )}
              </div>

              <details className="mt-3">
                <summary className="meta cursor-pointer font-medium underline underline-offset-4">
                  Original note
                </summary>
                <p className="mt-2 whitespace-pre-line text-[0.9375rem] text-[var(--text-2)]">
                  {entry.rawContent}
                </p>
              </details>

              {actionable.length > 0 && (
                <div className="mt-5">
                  <h3 className="h3">To review</h3>
                  {actionable.map((item) => {
                    const isPending = item.reviewStatus === "PENDING_REVIEW";
                    return (
                      <div key={item.id} className="row">
                        <div className="row-main">
                          <p className="title">{item.title}</p>
                          <p className="meta flex flex-wrap items-center gap-x-3">
                            {item.lifeArea && (
                              <AreaLabel
                                name={item.lifeArea.name}
                                token={item.lifeArea.colorToken}
                              />
                            )}
                            <span>
                              {CLASSIFICATION_LABEL[item.classification] ??
                                item.classification}
                            </span>
                          </p>
                          {item.sourceQuote && (
                            <p className="meta-soft mt-1">&ldquo;{item.sourceQuote}&rdquo;</p>
                          )}
                        </div>

                        {isPending ? (
                          <form
                            action={resolveExtractedActionAction}
                            className="row-actions"
                          >
                            <input type="hidden" name="extractedActionId" value={item.id} />
                            <Dropdown label="Options" variant="ghost" form>
                              <div className="space-y-3">
                                <div>
                                  <label htmlFor={`a-${item.id}`} className="label">
                                    Area
                                  </label>
                                  <select
                                    id={`a-${item.id}`}
                                    name="overrideLifeAreaId"
                                    defaultValue={item.lifeAreaId ?? lifeAreas[0]?.id ?? ""}
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
                                  <label htmlFor={`c-${item.id}`} className="label">
                                    Type
                                  </label>
                                  <select
                                    id={`c-${item.id}`}
                                    name="overrideCommitmentType"
                                    defaultValue={
                                      item.classification === "FOLLOW_UP" &&
                                      item.waitingOnTarget
                                        ? "WAITING"
                                        : item.suggestedCommitment
                                    }
                                    className="field"
                                  >
                                    <option value="FLEXIBLE">Flexible</option>
                                    <option value="WAITING">Waiting</option>
                                    <option value="SCHEDULED">Scheduled</option>
                                  </select>
                                </div>
                              </div>
                            </Dropdown>
                            <button
                              type="submit"
                              name="decision"
                              value="APPROVE"
                              className="button button-primary"
                            >
                              Approve
                            </button>
                            <button
                              type="submit"
                              name="decision"
                              value="DISMISS"
                              className="button button-ghost"
                            >
                              Dismiss
                            </button>
                          </form>
                        ) : (
                          <p className="meta-soft">
                            {item.reviewStatus === "APPROVED" ? "Approved" : "Dismissed"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {others.length > 0 && (
                <div className="mt-5">
                  <h3 className="h3">Not tasks</h3>
                  {others.map((item) => (
                    <div key={item.id} className="row">
                      <div className="row-main">
                        <p className="title">{item.title}</p>
                        <p className="meta">
                          {CLASSIFICATION_LABEL[item.classification] ??
                            item.classification}
                        </p>
                      </div>
                      {item.reviewStatus === "PENDING_REVIEW" ? (
                        <form
                          action={resolveExtractedActionAction}
                          className="row-actions"
                        >
                          <input type="hidden" name="extractedActionId" value={item.id} />
                          <button
                            type="submit"
                            name="decision"
                            value="APPROVE"
                            className="button button-secondary"
                          >
                            {item.classification === "ALREADY_COMPLETED"
                              ? "Log as done"
                              : "Add as task"}
                          </button>
                          <button
                            type="submit"
                            name="decision"
                            value="DISMISS"
                            className="button button-ghost"
                          >
                            Dismiss
                          </button>
                        </form>
                      ) : (
                        <p className="meta-soft">
                          {item.reviewStatus === "APPROVED" ? "Added" : "Dismissed"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </OrbitShell>
  );
}
