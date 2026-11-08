import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OrbitShell } from "@/components/shell/orbit-shell";
import {
  NotesClient,
  type SavedNoteItem,
} from "@/components/inbox/notes-client";
import {
  CAPTURE_KIND_LABEL,
  CLASSIFICATION_LABEL,
  formatClock,
  formatShortDate,
} from "@/lib/time/format";

export const dynamic = "force-dynamic";

const ACTIONABLE = [
  "AGREED_TO_DO",
  "ASSIGNED_TO_USER",
  "FOLLOW_UP",
  "DEADLINE_MENTION",
];

export default async function NotesPage() {
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
  const areaOptions = lifeAreas.map((a) => ({ id: a.id, name: a.name }));
  const pendingTotal = entries.reduce(
    (sum, e) =>
      sum +
      e.extractedActions.filter((a) => a.reviewStatus === "PENDING_REVIEW")
        .length,
    0
  );

  const noteItems: SavedNoteItem[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.title ?? "Captured note",
    kindLabel: CAPTURE_KIND_LABEL[entry.captureKind] ?? "Note",
    whenLabel: `${formatShortDate(entry.createdAt, tz)} ${formatClock(
      entry.createdAt,
      tz
    )}`,
    speakerContext: entry.speakerContext,
    rawContent: entry.rawContent,
    extractedActions: entry.extractedActions.map((a) => ({
      id: a.id,
      title: a.title,
      lifeAreaId: a.lifeAreaId,
      classification: a.classification,
      classificationLabel:
        CLASSIFICATION_LABEL[a.classification] ?? a.classification,
      isActionable: ACTIONABLE.includes(a.classification),
      sourceQuote: a.sourceQuote,
      waitingOnTarget: a.waitingOnTarget,
      suggestedCommitment: a.suggestedCommitment,
      reviewStatus: a.reviewStatus,
      lifeArea: a.lifeArea
        ? {
            name: a.lifeArea.name,
            slug: a.lifeArea.slug,
            colorToken: a.lifeArea.colorToken,
          }
        : null,
    })),
  }));

  return (
    <OrbitShell
      lifeAreas={lifeAreas}
      projects={projects}
      unreviewedInboxCount={pendingTotal}
    >
      <NotesClient
        entries={noteItems}
        areaOptions={areaOptions}
        pendingTotal={pendingTotal}
      />
    </OrbitShell>
  );
}
