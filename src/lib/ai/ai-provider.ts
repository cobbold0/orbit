import { GoogleGenAI } from "@google/genai";
import { Temporal } from "temporal-polyfill";
import {
  CandidateActionItem,
  ConversationalPlanResponse,
  ConversationalPlanResponseSchema,
  MemoryExtractionResult,
  MemoryExtractionResultSchema,
  ProposedMutation,
} from "./schemas";
import type { UserOrbitContext } from "@/modules/ai/context-retriever";
import { parseQuickCaptureInput } from "@/modules/tasks/quick-capture-parser";

export interface AIProvider {
  readonly name: string;
  extractMemoryActions(
    rawContent: string,
    speakerContext: string | null,
    userContext: UserOrbitContext
  ): Promise<MemoryExtractionResult>;

  planWithContext(
    userMessage: string,
    userContext: UserOrbitContext
  ): Promise<ConversationalPlanResponse>;

  transcribeAudioNote(
    audioBase64: string,
    mimeType: string
  ): Promise<{ transcript: string; providerUsed: string }>;
}

/**
 * Normalizes the configured Gemini model ID so experimental or mistyped strings
 * (such as "gemini-3.5-flash-lite") map safely to a supported official Gemini model.
 */
export function resolveSupportedGeminiModel(configured?: string): string {
  const trimmed = (configured ?? "").trim();
  if (!trimmed || trimmed === "gemini-3.5-flash-lite") {
    return "gemini-2.5-flash";
  }
  return trimmed;
}

function parseTimeString(raw: string, preferEvening = false): string | null {
  const clean = raw.trim().toLowerCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1]!, 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  if (period === "pm" && hours < 12) hours += 12;
  else if (period === "am" && hours === 12) hours = 0;
  else if (!period) {
    if (preferEvening && hours >= 1 && hours <= 11) hours += 12;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Deterministic fallback analyzer that guarantees Orbit's Memory Inbox and
 * Conversational Planner remain 100% functional even when Gemini is unconfigured
 * or unreachable (Core Principle #9).
 */
export class DeterministicFallbackProvider implements AIProvider {
  readonly name = "DETERMINISTIC_FALLBACK";

  async extractMemoryActions(
    rawContent: string,
    speakerContext: string | null,
    userContext: UserOrbitContext
  ): Promise<MemoryExtractionResult> {
    const clauses = rawContent
      .split(/(?<=[.!?])\s+|\n+|;\s+|\s+and\s+(?=(?:contact|prepare|present|noted|mentioned|we\s+need|we\s+agreed))/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);

    const items: CandidateActionItem[] = [];

    const matchAreaAndProject = (text: string) => {
      const lower = text.toLowerCase();
      for (const area of userContext.lifeAreas) {
        if (lower.includes(area.name.toLowerCase()) || lower.includes(area.slug)) {
          const proj = userContext.activeProjects.find(
            (p) => p.lifeAreaId === area.id
          );
          return { slug: area.slug, projectId: proj?.id ?? null };
        }
      }
      if (/\b(?:odoo|attendance|staff|ceo|management)\b/i.test(text)) {
        const basilissa = userContext.lifeAreas.find(
          (a) => a.slug.startsWith("basilissa")
        );
        const proj = userContext.activeProjects.find(
          (p) => p.lifeAreaId === basilissa?.id
        );
        return { slug: basilissa?.slug ?? "basilissa", projectId: proj?.id ?? null };
      }
      if (/\b(?:daw|vocal|singing|drum|beat|mix|song)\b/i.test(text)) {
        const music = userContext.lifeAreas.find((a) =>
          a.slug.startsWith("music")
        );
        const proj = userContext.activeProjects.find(
          (p) => p.lifeAreaId === music?.id
        );
        return { slug: music?.slug ?? "music", projectId: proj?.id ?? null };
      }
      if (/\b(?:exam|lecture|class|study)\b/i.test(text)) {
        const edu = userContext.lifeAreas.find((a) =>
          a.slug.startsWith("education")
        );
        const proj = userContext.activeProjects.find(
          (p) => p.lifeAreaId === edu?.id
        );
        return { slug: edu?.slug ?? "education", projectId: proj?.id ?? null };
      }
      const speakerLower = (speakerContext ?? "").toLowerCase();
      for (const area of userContext.lifeAreas) {
        if (speakerLower.includes(area.name.toLowerCase())) {
          const proj = userContext.activeProjects.find(
            (p) => p.lifeAreaId === area.id
          );
          return { slug: area.slug, projectId: proj?.id ?? null };
        }
      }
      return {
        slug: userContext.lifeAreas[0]?.slug ?? "personal",
        projectId: null,
      };
    };

    for (const clause of clauses) {
      // Ignore pure scene-setting introductory clauses like "Spoke with the CEO this morning."
      if (
        /^(?:spoke|met|talked|had a (?:call|chat|conversation))\s+with\b/i.test(
          clause
        ) &&
        !/\b(?:agreed|need|must|will|todo|assign)\b/i.test(clause)
      ) {
        continue;
      }

      const { slug, projectId } = matchAreaAndProject(clause);
      let classification: CandidateActionItem["classification"] = "AGREED_TO_DO";
      const suggestedCommitment: CandidateActionItem["suggestedCommitment"] =
        "FLEXIBLE";
      let waitingOnTarget: string | null = null;

      if (/\b(?:already\s+completed|already\s+done|finished\s+yesterday|was\s+completed)\b/i.test(clause)) {
        classification = "ALREADY_COMPLETED";
      } else if (
        /\b(?:casually\s+mentioned|merely\s+mentioned|might\s+explore|someday|next\s+year|just\s+mentioned)\b/i.test(
          clause
        )
      ) {
        classification = "MENTIONED_ONLY";
      } else if (/\b(?:idea|could\s+maybe|brainstorm|what\s+if)\b/i.test(clause)) {
        classification = "IDEA_PROPOSED";
      } else if (/\b(?:before\s+the\s+next|deadline|by\s+friday|due\s+before|present\s+progress)\b/i.test(clause)) {
        classification = "DEADLINE_MENTION";
      } else if (/\b(?:contact|reach\s+out|ask|follow\s+up|waiting\s+on)\b/i.test(clause)) {
        classification = "FOLLOW_UP";
        const personMatch = clause.match(
          /\b(?:contact|ask|waiting\s+on)\s+(?:the\s+)?([A-Za-z0-9\s]{2,25}?)(?:\s+(?:about|regarding|for|to)\b|$)/i
        );
        if (personMatch?.[1]) {
          waitingOnTarget = personMatch[1].trim();
        }
      } else if (/\b(?:we\s+need\s+to|assigned|prepare\s+the|you\s+need\s+to)\b/i.test(clause)) {
        classification = "ASSIGNED_TO_USER";
      }

      const cleanedTitle = clause
        .replace(
          /^(?:we\s+agreed\s+(?:that\s+)?(?:i\s+will\s+)?|he\s+also\s+casually\s+mentioned\s+(?:that\s+)?|noted\s+that\s+(?:the\s+)?|we\s+also\s+need\s+to\s+|i\s+will\s+)/i,
          ""
        )
        .replace(/[.!?]+$/, "")
        .trim();

      const title =
        cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

      items.push({
        title: title.slice(0, 180),
        description: speakerContext ? `From: ${speakerContext}` : null,
        sourceQuote: clause,
        classification,
        suggestedCommitment,
        suggestedLifeAreaSlug: slug,
        suggestedProjectId: projectId,
        waitingOnTarget,
        suggestedDueDateIso: null,
        suggestedScheduledStartIso: null,
        confidenceScore: 0.88,
      });
    }

    const actionableCount = items.filter((i) =>
      ["AGREED_TO_DO", "ASSIGNED_TO_USER", "FOLLOW_UP", "DEADLINE_MENTION"].includes(
        i.classification
      )
    ).length;
    const contextCount = items.length - actionableCount;

    return {
      summary: `Identified ${actionableCount} actionable commitment(s) and separated ${contextCount} contextual/completed mention(s) for review.`,
      items,
      providerUsed: "DETERMINISTIC_FALLBACK",
    };
  }

  async planWithContext(
    userMessage: string,
    userContext: UserOrbitContext
  ): Promise<ConversationalPlanResponse> {
    const trimmed = userMessage.trim();
    const lower = trimmed.toLowerCase();
    const todayPlain = Temporal.PlainDate.from(userContext.localDate);

    // Case 0: Preference updates (sleep time, wake time, quiet hours)
    if (
      /\b(?:sleep(?:ing)?(?:\s+time)?|bedtime|wake(?:\s+up)?(?:\s+time)?|quiet\s+hours)\b/i.test(
        lower
      )
    ) {
      let declaredSleepTime: string | null = null;
      let declaredWakeTime: string | null = null;
      let quietHoursEnabled: boolean | null = null;
      let quietHoursStart: string | null = null;
      let quietHoursEnd: string | null = null;
      const explanationParts: string[] = [];

      const sleepMatch = lower.match(
        /(?:sleep(?:ing)?(?:\s+time)?|bedtime).*?(?:to|at)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
      );
      if (sleepMatch?.[1]) {
        const parsed = parseTimeString(sleepMatch[1], true);
        if (parsed) {
          declaredSleepTime = parsed;
          explanationParts.push(`Shift sleep time to ${parsed}`);
        }
      }

      const wakeMatch = lower.match(
        /(?:wake(?:\s+up)?(?:\s+time)?).*?(?:to|at)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
      );
      if (wakeMatch?.[1]) {
        const parsed = parseTimeString(wakeMatch[1], false);
        if (parsed) {
          declaredWakeTime = parsed;
          explanationParts.push(`Shift wake time to ${parsed}`);
        }
      }

      if (/\bquiet\s+hours\b/i.test(lower)) {
        if (/\b(?:disable|turn\s+off|off)\b/i.test(lower)) {
          quietHoursEnabled = false;
          explanationParts.push("Disable quiet hours");
        } else if (/\b(?:enable|turn\s+on|on)\b/i.test(lower)) {
          quietHoursEnabled = true;
          explanationParts.push("Enable quiet hours");
        }
        const rangeMatch = lower.match(
          /quiet\s+hours.*?(?:from\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|until|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
        );
        if (rangeMatch?.[1] && rangeMatch?.[2]) {
          const s = parseTimeString(rangeMatch[1], true);
          const e = parseTimeString(rangeMatch[2], false);
          if (s && e) {
            quietHoursStart = s;
            quietHoursEnd = e;
            explanationParts.push(`Set quiet hours from ${s} to ${e}`);
          }
        }
      }

      if (explanationParts.length > 0) {
        const explanation = explanationParts.join(", ");
        const mutation: ProposedMutation = {
          mutationKind: "UPDATE_PREFERENCE",
          declaredSleepTime,
          declaredWakeTime,
          quietHoursEnabled,
          quietHoursStart,
          quietHoursEnd,
          explanation,
        };

        return {
          replyMarkdown: `I can update your preferences for you: ${explanation}. Confirm below to apply this update.`,
          citedFacts: [
            `Current wake time: ${userContext.userPreferences.declaredWakeTime}`,
            `Current sleep time: ${userContext.userPreferences.declaredSleepTime}`,
          ],
          assumptionsOrSuggestions: [
            `Changes will take effect across your daily briefings and schedules.`,
          ],
          proposedMutations: [mutation],
          providerUsed: "DETERMINISTIC_FALLBACK",
        };
      }
    }

    // Case 0.5: Complete / finish a task
    if (
      /\b(?:completed?|finished?|done\s+with|mark(?:\s+as)?\s+(?:done|complete))\b/i.test(
        lower
      ) &&
      userContext.openTasks.length > 0
    ) {
      const words = lower
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 3 &&
            ![
              "completed",
              "complete",
              "finished",
              "finish",
              "done",
              "mark",
              "task",
              "the",
              "with",
              "for",
            ].includes(w)
        );

      let bestTask = userContext.openTasks[0]!;
      let bestScore = -1;

      for (const task of userContext.openTasks) {
        const hay =
          `${task.title} ${task.lifeAreaName} ${task.projectTitle ?? ""}`.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (hay.includes(w)) score += 2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestTask = task;
        }
      }

      if (bestScore > 0) {
        const mutation: ProposedMutation = {
          mutationKind: "COMPLETE_TASK",
          taskId: bestTask.id,
          taskTitle: bestTask.title,
          explanation: `Mark "${bestTask.title}" (${bestTask.lifeAreaName}) as completed.`,
        };
        return {
          replyMarkdown: `Great job on finishing "${bestTask.title}"! Ready to mark it as completed. Confirm below to record your progress.`,
          citedFacts: [
            `Matched open task: "${bestTask.title}" under ${bestTask.lifeAreaName}`,
          ],
          assumptionsOrSuggestions: [
            `Completing tasks unlocks mental space for what's next.`,
          ],
          proposedMutations: [mutation],
          providerUsed: "DETERMINISTIC_FALLBACK",
        };
      }
    }

    // Case 1: Reschedule / Move an existing task
    // e.g. "I didn't finish the attendance dashboard today. Move it to Friday afternoon."
    const isRescheduleIntent =
      /\b(?:move|reschedule|postpone|shift|push|didn't\s+finish|did\s+not\s+finish)\b/i.test(
        trimmed
      );

    if (isRescheduleIntent && userContext.openTasks.length > 0) {
      // Score open tasks by word overlap with user message
      const words = lower
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 3 &&
            ![
              "the",
              "and",
              "for",
              "today",
              "move",
              "finish",
              "didnt",
              "afternoon",
              "morning",
              "evening",
              "tomorrow",
              "friday",
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "saturday",
              "sunday",
            ].includes(w)
        );

      let bestTask = userContext.openTasks[0]!;
      let bestScore = -1;

      for (const task of userContext.openTasks) {
        const hay = `${task.title} ${task.lifeAreaName} ${task.projectTitle ?? ""}`.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (hay.includes(w)) score += 2;
        }
        if (task.status === "NEEDS_CHECKIN") score += 1;
        if (score > bestScore) {
          bestScore = score;
          bestTask = task;
        }
      }

      // Determine target day (e.g., "Friday", "tomorrow", etc.)
      const dayNameMap: Record<string, number> = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 7,
      };

      let targetDate = todayPlain.add({ days: 1 });
      let matchedExplicitDay = false;
      for (const [dayName, isoDay] of Object.entries(dayNameMap)) {
        if (lower.includes(dayName)) {
          const delta = (isoDay - todayPlain.dayOfWeek + 7) % 7 || 7;
          targetDate = todayPlain.add({ days: delta });
          matchedExplicitDay = true;
          break;
        }
      }
      if (!matchedExplicitDay) {
        if (lower.includes("tomorrow")) {
          targetDate = todayPlain.add({ days: 1 });
        } else if (
          /\b(?:to|for)\s+(?:later\s+)?today\b|\btonight\b/i.test(lower)
        ) {
          targetDate = todayPlain;
        }
      }

      let targetTime = "14:00";
      if (lower.includes("morning")) targetTime = "09:30";
      else if (lower.includes("afternoon")) targetTime = "14:00";
      else if (lower.includes("evening") || lower.includes("tonight"))
        targetTime = "19:30";

      const mutation: ProposedMutation = {
        mutationKind: "RESCHEDULE_TASK",
        taskId: bestTask.id,
        taskTitle: bestTask.title,
        lifeAreaName: bestTask.lifeAreaName,
        newCommitmentType: lower.includes("flexible")
          ? "FLEXIBLE"
          : "SCHEDULED",
        targetDateStr: targetDate.toString(),
        targetTimeStr: targetTime,
        flexibilityWindow: lower.includes("flexible") ? "THIS_WEEK" : null,
        explanation: `Reschedule "${bestTask.title}" (${bestTask.lifeAreaName}) to ${targetDate.toString()} at ${targetTime} (${userContext.ianaTimeZone}).`,
      };

      return {
        replyMarkdown: `Ready to move "${bestTask.title}" (${bestTask.lifeAreaName}) to ${targetDate.toString()} at ${targetTime}. Nothing has changed yet. Confirm below to apply it.`,
        citedFacts: [
          `Matched open task: "${bestTask.title}" (${bestTask.lifeAreaName}, ${bestTask.commitmentType.toLowerCase()})`,
          `Time zone: ${userContext.ianaTimeZone} (today is ${userContext.localDate})`,
        ],
        assumptionsOrSuggestions: [
          `Target slot: ${targetDate.toString()} at ${targetTime} local time.`,
        ],
        proposedMutations: [mutation],
        providerUsed: "DETERMINISTIC_FALLBACK",
      };
    }

    // Case 2: Create / Remind intent
    const isCreateIntent =
      /\b(?:remind\s+me|create|add|schedule|call|email|contact|practice|study|prepare)\b/i.test(
        trimmed
      ) && !/\b(?:what|which|show|summary|how)\b/i.test(trimmed);

    if (isCreateIntent) {
      // Check if user mentioned an entity that doesn't match an existing area or project
      const forEntityMatch = trimmed.match(/\b(?:for|under|in)\s+([A-Za-z0-9_-]+)/i);
      const mentionedEntity = forEntityMatch?.[1];
      const isEntityKnown =
        !mentionedEntity ||
        userContext.lifeAreas.some(
          (a) => a.name.toLowerCase() === mentionedEntity.toLowerCase()
        ) ||
        userContext.activeProjects.some(
          (p) => p.title.toLowerCase() === mentionedEntity.toLowerCase()
        );

      if (mentionedEntity && !isEntityKnown && userContext.lifeAreas.length > 0) {
        const areaNames = userContext.lifeAreas.map((a) => a.name).join(", ");
        return {
          replyMarkdown: `I'd love to help with ${mentionedEntity}! Which Life Area should this task belong to (${areaNames}), or would you like to set up "${mentionedEntity}" as a new Life Area or Project first?`,
          citedFacts: [`Available Life Areas: ${areaNames}`],
          assumptionsOrSuggestions: [
            `Please specify which Life Area should hold tasks for "${mentionedEntity}".`,
          ],
          proposedMutations: [],
          providerUsed: "DETERMINISTIC_FALLBACK",
        };
      }

      const parsed = parseQuickCaptureInput(
        trimmed,
        userContext.lifeAreas,
        userContext.ianaTimeZone
      );
      const area =
        userContext.lifeAreas.find((a) => a.id === parsed.lifeAreaId) ??
        userContext.lifeAreas[0]!;

      let targetDateStr: string | null = null;
      let targetTimeStr: string | null = null;
      if (parsed.scheduledStart) {
        const inst = Temporal.Instant.fromEpochMilliseconds(
          parsed.scheduledStart.getTime()
        );
        const z = inst.toZonedDateTimeISO(userContext.ianaTimeZone);
        targetDateStr = z.toPlainDate().toString();
        targetTimeStr = `${String(z.hour).padStart(2, "0")}:${String(
          z.minute
        ).padStart(2, "0")}`;
      }

      const mutation: ProposedMutation = {
        mutationKind: "CREATE_TASK",
        title: parsed.title,
        lifeAreaId: area.id,
        lifeAreaName: area.name,
        commitmentType: parsed.commitmentType,
        targetDateStr,
        targetTimeStr,
        flexibilityWindow: parsed.flexibilityWindow,
        estimatedMinutes: parsed.estimatedMinutes,
        waitingOnPerson: parsed.waitingOnPerson,
        explanation:
          parsed.commitmentType === "SCHEDULED"
            ? `Schedule "${parsed.title}" under ${area.name} on ${targetDateStr} at ${targetTimeStr}.`
            : `Create ${parsed.commitmentType.toLowerCase()} task "${parsed.title}" under ${area.name}.`,
      };

      return {
        replyMarkdown: `Ready to add "${parsed.title}" under ${area.name} (${parsed.commitmentType.toLowerCase()}). Confirm below to create it.`,
        citedFacts: [
          `Area: ${area.name}`,
          `Local date in ${userContext.ianaTimeZone}: ${userContext.localDate}`,
        ],
        assumptionsOrSuggestions: [
          parsed.commitmentType === "SCHEDULED"
            ? `Scheduled slot: ${targetDateStr} at ${targetTimeStr}`
            : `Kept flexible so it stays visible without blocking your calendar.`,
        ],
        proposedMutations: [mutation],
        providerUsed: "DETERMINISTIC_FALLBACK",
      };
    }

    // Case 2.5: Specific past or future date query (queriedDateSchedule)
    if (userContext.queriedDateSchedule) {
      const q = userContext.queriedDateSchedule;
      const facts: string[] = [
        `Target date: ${q.dayName}, ${q.queryDateStr} (${
          q.isPast ? "past" : q.isFuture ? "future" : "today"
        })`,
      ];

      if (q.isPast) {
        let replyMarkdown = "";
        let advice = "Reflecting on your historical progress helps guide future focus.";
        const sections: string[] = [];

        if (q.pastActivities.length > 0) {
          const actLines = q.pastActivities.map(
            (a) =>
              `• **${a.title}**${
                a.durationMinutes ? ` (${a.durationMinutes}m)` : ""
              }${a.lifeAreaName ? ` under ${a.lifeAreaName}` : ""}`
          );
          sections.push(`**Logged Activities:**\n${actLines.join("\n")}`);
          facts.push(`${q.pastActivities.length} logged activity session(s).`);
        }

        if (q.completedTasks.length > 0) {
          const taskLines = q.completedTasks.map(
            (t) => `• **${t.title}** (${t.lifeAreaName})`
          );
          sections.push(`**Completed Tasks:**\n${taskLines.join("\n")}`);
          facts.push(`${q.completedTasks.length} completed task(s).`);
        }

        if (sections.length > 0) {
          replyMarkdown = `On ${q.dayName}, ${q.queryDateStr}, here is what was recorded:\n\n${sections.join(
            "\n\n"
          )}`;
          advice = "Consistent logging provides clear historical visibility.";
        } else {
          replyMarkdown = `On ${q.dayName}, ${q.queryDateStr}, you had no logged activities or completed tasks recorded in Orbit.`;
          advice = "Orbit preserves entries whenever you log them.";
        }

        return {
          replyMarkdown,
          citedFacts: facts,
          assumptionsOrSuggestions: [advice],
          proposedMutations: [],
          providerUsed: "DETERMINISTIC_FALLBACK",
        };
      }

      // Future or queried date
      const allRoutines = q.routinesAndLocations;
      const scheduledTasks = q.scheduledTasks;

      let replyMarkdown = "";
      let advice = "";

      if (allRoutines.length === 0 && scheduledTasks.length === 0) {
        replyMarkdown = `On ${q.dayName}, ${q.queryDateStr}, your calendar is completely open! No routines, travel, or tasks are currently scheduled for that date.`;
        advice = "Plenty of breathing room to allocate as needed.";
      } else {
        const sections: string[] = [];
        if (allRoutines.length > 0) {
          const rLines = allRoutines.map((r) => {
            const loc = r.physicalLocation ? ` at **${r.physicalLocation}**` : "";
            return `• **${r.title}**${loc} (${r.startTime} - ${r.endTime})`;
          });
          sections.push(`**Routines & Places to be:**\n${rLines.join("\n")}`);
          facts.push(
            ...allRoutines.map((r) => `${r.title} (${r.startTime}-${r.endTime})`)
          );
        }
        if (scheduledTasks.length > 0) {
          const tLines = scheduledTasks.map(
            (t) =>
              `• **${t.title}** (${t.lifeAreaName}${
                t.startTime ? `, ${t.startTime}` : ""
              })`
          );
          sections.push(`**Scheduled Commitments:**\n${tLines.join("\n")}`);
          facts.push(...scheduledTasks.map((t) => `${t.title}`));
        }
        replyMarkdown = `Here is what is scheduled for ${q.dayName}, ${q.queryDateStr}:\n\n${sections.join(
          "\n\n"
        )}`;
        advice = `Review commitments for ${q.dayName} to prepare in advance.`;
      }

      return {
        replyMarkdown,
        citedFacts: facts,
        assumptionsOrSuggestions: [advice],
        proposedMutations: [],
        providerUsed: "DETERMINISTIC_FALLBACK",
      };
    }

    // Case 2.6: Milestones or project progress query
    if (
      /\b(?:milestones?|project\s+progress|journey\s+progress|how\s+far)\b/i.test(
        lower
      )
    ) {
      for (const proj of userContext.activeProjects) {
        if (
          lower.includes(proj.title.toLowerCase()) ||
          lower.includes(proj.lifeAreaSlug)
        ) {
          const completed = proj.milestones.filter(
            (m) => m.status === "COMPLETED"
          );
          const pending = proj.milestones.filter(
            (m) => m.status !== "COMPLETED"
          );

          let replyMarkdown = "";
          if (proj.milestones.length === 0) {
            replyMarkdown = `Project **${proj.title}** (${proj.lifeAreaName}) currently has no milestones set up yet.\n\nYou can add milestones from the Projects screen anytime.`;
          } else {
            const mList = proj.milestones
              .map(
                (m) =>
                  `• ${m.status === "COMPLETED" ? "✅" : "⏳"} **${
                    m.title
                  }** (${m.status.toLowerCase()})`
              )
              .join("\n");
            const nextMilestone = pending[0]
              ? `\n\nNext milestone to tackle: **${pending[0].title}**.`
              : "\n\nAll milestones for this project are complete!";
            replyMarkdown = `Here is the milestone progress for **${proj.title}** (${proj.lifeAreaName}):\n\n${mList}${nextMilestone}`;
          }

          return {
            replyMarkdown,
            citedFacts: [
              `Project "${proj.title}" has ${completed.length} completed and ${pending.length} pending milestone(s).`,
            ],
            assumptionsOrSuggestions: [
              pending[0]
                ? `Focus on "${pending[0].title}" as your next key milestone.`
                : "Great milestone completion rate on this project.",
            ],
            proposedMutations: [],
            providerUsed: "DETERMINISTIC_FALLBACK",
          };
        }
      }
    }

    // Case 2.7: Accomplishments / Completed tasks query
    if (
      /\b(?:what\s+did\s+i\s+(?:accomplish|complete|finish)|accomplishments?|finished\s+today|completed\s+today)\b/i.test(
        lower
      )
    ) {
      const todayDone = userContext.completedTasksToday;
      let replyMarkdown = "";
      let advice = "";

      if (todayDone.length > 0) {
        const list = todayDone
          .map((t) => `• ✅ **${t.title}** (${t.lifeAreaName})`)
          .join("\n");
        replyMarkdown = `Here is what you accomplished today:\n\n${list}\n\nFantastic job getting these across the finish line! Celebrating your wins keeps your momentum strong.`;
        advice = `Great momentum with ${todayDone.length} completed task(s) today.`;
      } else {
        replyMarkdown = `You haven't marked any tasks as completed today yet.\n\nWhenever you finish a task, check it off or ask me to mark it complete to log your win!`;
        advice = "Pick an open task to complete and lock in today's first win.";
      }

      return {
        replyMarkdown,
        citedFacts: [`${todayDone.length} task(s) completed today.`],
        assumptionsOrSuggestions: [advice],
        proposedMutations: [],
        providerUsed: "DETERMINISTIC_FALLBACK",
      };
    }

    // Case 2.8: Notes / Memory Inbox query
    if (
      /\b(?:what\s+did\s+i\s+(?:note|write|capture)|my\s+notes|recent\s+notes|inbox\s+notes)\b/i.test(
        lower
      )
    ) {
      if (userContext.recentInboxNotes.length > 0) {
        const list = userContext.recentInboxNotes
          .slice(0, 4)
          .map((n) => `• **${n.title || "Note"}**: ${n.summary || n.rawSnippet}`)
          .join("\n");
        return {
          replyMarkdown: `Here are your recent captured notes:\n\n${list}\n\nYou can review and convert actionable items into tasks anytime in your Memory Inbox.`,
          citedFacts: [
            `${userContext.recentInboxNotes.length} recent note(s) in inbox.`,
          ],
          assumptionsOrSuggestions: [
            "Regularly reviewing notes keeps your commitments organized.",
          ],
          proposedMutations: [],
          providerUsed: "DETERMINISTIC_FALLBACK",
        };
      }
    }

    // Case 3: Schedule, Agenda, Tomorrow, Today, or Places to be query
    const isTomorrow = /\btomorrow\b/i.test(lower);
    const isLocationQuery =
      /\b(?:where\s+(?:am\s+i|do\s+i)\s+(?:going|have\s+to\s+be)|where\s+to\s+go|places?\s+to\s+be|going|places?)\b/i.test(
        lower
      );
    const isScheduleQuery =
      /\b(?:what\s+(?:do\s+i\s+have|is\s+my\s+schedule|is\s+on\s+my\s+schedule)|schedule|agenda|today|tomorrow|commitments?)\b/i.test(
        lower
      );

    if (isTomorrow || isLocationQuery || isScheduleQuery) {
      const schedule = isTomorrow
        ? userContext.tomorrowSchedule
        : userContext.todaySchedule;
      const dayLabel = isTomorrow ? "tomorrow" : "today";
      const capDayLabel = isTomorrow ? "Tomorrow" : "Today";

      const routinesWithLocation = (schedule?.routinesAndLocations ?? []).filter(
        (r) => r.physicalLocation && r.physicalLocation.trim().length > 0
      );
      const allRoutines = schedule?.routinesAndLocations ?? [];
      const scheduledTasks = schedule?.scheduledTasks ?? [];

      let replyMarkdown = "";
      let advice = "";
      const facts: string[] = [
        `${schedule?.dayName ?? capDayLabel} (${schedule?.dateStr ?? userContext.localDate}) has ${allRoutines.length} routine(s) and ${scheduledTasks.length} scheduled task(s).`,
      ];

      if (isLocationQuery) {
        if (routinesWithLocation.length > 0) {
          const locList = routinesWithLocation
            .map(
              (r) =>
                `• **${r.physicalLocation}** for **${r.title}** (${r.startTime} to ${r.endTime}${
                  r.lifeAreaName ? `, ${r.lifeAreaName}` : ""
                })`
            )
            .join("\n");
          replyMarkdown = `${capDayLabel} (${schedule?.dayName ?? ""}), you have places to be:\n\n${locList}\n\nMake sure to factor in travel time and leave with a buffer so you have a smooth trip!`;
          advice = `Head out with a travel buffer for ${routinesWithLocation[0]?.physicalLocation}.`;
          facts.push(
            ...routinesWithLocation.map(
              (r) =>
                `${r.title} at ${r.physicalLocation} (${r.startTime} - ${r.endTime})`
            )
          );
        } else if (allRoutines.length > 0) {
          const rList = allRoutines
            .map((r) => `• **${r.title}** (${r.startTime} to ${r.endTime})`)
            .join("\n");
          replyMarkdown = `${capDayLabel} (${schedule?.dayName ?? ""}) you have routines on your calendar, but none have a specific physical location attached:\n\n${rList}\n\nYou don't have anywhere specific you need to travel to!`;
          advice =
            "All scheduled routines are flexible or remote without travel requirements.";
        } else {
          replyMarkdown = `${capDayLabel} (${schedule?.dayName ?? ""}), you don't have anywhere you need to go! You have no travel or physical locations on your schedule.`;
          advice = `${capDayLabel} is open from travel obligations.`;
        }

        return {
          replyMarkdown,
          citedFacts: facts,
          assumptionsOrSuggestions: [advice],
          proposedMutations: [],
          providerUsed: "DETERMINISTIC_FALLBACK",
        };
      }

      // General schedule for tomorrow or today
      if (allRoutines.length === 0 && scheduledTasks.length === 0) {
        if (isTomorrow) {
          replyMarkdown = `Tomorrow (${schedule?.dayName ?? ""}) your calendar is completely open! You don't have any routines or scheduled appointments booked yet.\n\nEnjoy the space to work on personal priorities or flexible tasks at your own pace.`;
          advice = "Wide open day ahead. Good opportunity for focused deep work.";
        } else {
          const flexibleTasks = userContext.openTasks.filter(
            (t) => t.commitmentType === "FLEXIBLE"
          );
          if (flexibleTasks.length > 0) {
            const flexList = flexibleTasks
              .slice(0, 3)
              .map((t) => `• ${t.title} (${t.lifeAreaName})`)
              .join("\n");
            replyMarkdown = `You have no hard-scheduled appointments today, which gives you great freedom.\n\nYou do have ${flexibleTasks.length} flexible item${
              flexibleTasks.length > 1 ? "s" : ""
            } on deck:\n\n${flexList}\n\nMy advice: pick "${flexibleTasks[0]?.title}" for a focused sprint while your energy is fresh.`;
            advice = `Tackle "${flexibleTasks[0]?.title}" when ready.`;
          } else {
            replyMarkdown = `Your day is completely open! You don't have any scheduled appointments, routines, or open tasks waiting.\n\nEnjoy the breathing room to recharge!`;
            advice =
              "No urgent demands today. Take time to rest or explore personal interests.";
          }
        }
      } else {
        const sections: string[] = [];

        if (allRoutines.length > 0) {
          const rLines = allRoutines.map((r) => {
            const loc = r.physicalLocation ? ` at **${r.physicalLocation}**` : "";
            return `• **${r.title}**${loc} (${r.startTime} - ${r.endTime})`;
          });
          sections.push(`**Routines & Places to be:**\n${rLines.join("\n")}`);
          facts.push(
            ...allRoutines.map((r) => `${r.title} (${r.startTime}-${r.endTime})`)
          );
        }

        if (scheduledTasks.length > 0) {
          const tLines = scheduledTasks.map(
            (t) => `• **${t.title}** (${t.lifeAreaName}, ${t.startTime})`
          );
          sections.push(`**Scheduled Commitments:**\n${tLines.join("\n")}`);
          facts.push(
            ...scheduledTasks.map((t) => `${t.title} at ${t.startTime}`)
          );
        }

        replyMarkdown = `Here is what's on your schedule for ${dayLabel} (${schedule?.dayName ?? ""}):\n\n${sections.join(
          "\n\n"
        )}`;
        const firstItem = allRoutines[0] ?? scheduledTasks[0];
        advice = `Focus on preparing for ${firstItem?.title} first to establish a steady cadence.`;
      }

      return {
        replyMarkdown,
        citedFacts: facts,
        assumptionsOrSuggestions: [advice],
        proposedMutations: [],
        providerUsed: "DETERMINISTIC_FALLBACK",
      };
    }

    // Case 4: Default fallback for general open task questions
    const topTasks = userContext.openTasks.slice(0, 4);
    if (topTasks.length === 0) {
      return {
        replyMarkdown: `Everything is currently clear across your areas! No open tasks or pending follow-ups are waiting.\n\nWhenever something comes to mind, you can ask me to capture a task, note, or log your work.`,
        citedFacts: [
          `Local date in ${userContext.ianaTimeZone}: ${userContext.localDate}.`,
        ],
        assumptionsOrSuggestions: [
          "All caught up. Good time for reflection or planning ahead.",
        ],
        proposedMutations: [],
        providerUsed: "DETERMINISTIC_FALLBACK",
      };
    }

    const taskList = topTasks
      .map((t) => `• ${t.title} (${t.lifeAreaName})`)
      .join("\n");
    return {
      replyMarkdown: `Here are your main priorities across areas:\n\n${taskList}\n\nMy recommendation: prioritize "${topTasks[0]?.title}" first. Getting that across the finish line will free up mental clarity for everything else.`,
      citedFacts: [
        `${userContext.openTasks.length} open task(s) active across your areas.`,
        `Local date in ${userContext.ianaTimeZone}: ${userContext.localDate}.`,
      ],
      assumptionsOrSuggestions: [
        `Start with "${topTasks[0]?.title}" to create positive momentum.`,
      ],
      proposedMutations: [],
      providerUsed: "DETERMINISTIC_FALLBACK",
    };
  }

  async transcribeAudioNote(): Promise<{
    transcript: string;
    providerUsed: string;
  }> {
    return {
      transcript: "",
      providerUsed: "BROWSER_SPEECH_OR_MANUAL",
    };
  }
}

/**
 * Primary Gemini AI Provider using the official @google/genai SDK.
 * Automatically delegates to DeterministicFallbackProvider if GEMINI_API_KEY
 * is not configured or if a network/API error occurs.
 */
export class GeminiAIProvider implements AIProvider {
  readonly name = "GEMINI";
  private readonly fallback = new DeterministicFallbackProvider();

  private getClient(): GoogleGenAI | null {
    let apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) {
      apiKey = apiKey.slice(1, -1).trim();
    }
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }

  async extractMemoryActions(
    rawContent: string,
    speakerContext: string | null,
    userContext: UserOrbitContext
  ): Promise<MemoryExtractionResult> {
    const client = this.getClient();
    if (!client) {
      return this.fallback.extractMemoryActions(
        rawContent,
        speakerContext,
        userContext
      );
    }

    const modelName = resolveSupportedGeminiModel(process.env.GEMINI_MODEL);
    const areasContext = userContext.lifeAreas
      .map((a) => `${a.slug} (${a.name})`)
      .join(", ");
    const projectsContext = userContext.activeProjects
      .map((p) => `${p.id}: "${p.title}" [area=${p.lifeAreaSlug}]`)
      .join("; ");

    const prompt = `You are Orbit's Memory Inbox extraction engine.
Analyze the user's raw captured note and extract structured items.
CRITICAL PRODUCT RULES:
1. Not everything mentioned in a conversation should become a task!
2. Classify each extracted item strictly into one of:
   - "AGREED_TO_DO": User explicitly agreed to do this.
   - "ASSIGNED_TO_USER": Assigned to the user.
   - "FOLLOW_UP": Requires contacting or waiting on someone.
   - "DEADLINE_MENTION": A concrete deadline or presentation target.
   - "IDEA_PROPOSED": Merely proposed as an idea.
   - "MENTIONED_ONLY": Casually mentioned in conversation (do NOT turn into a task).
   - "ALREADY_COMPLETED": Already finished in the past.
3. Preserve an exact "sourceQuote" substring from the raw note for every item.
4. Available Life Area slugs: ${areasContext}
5. Available Projects: ${projectsContext}
6. Speaker / Meeting Context: ${speakerContext ?? "None"}

Return ONLY valid JSON matching:
{
  "summary": "1-2 sentence overview",
  "items": [
    {
      "title": "concise title",
      "description": "optional context",
      "sourceQuote": "exact quote from text",
      "classification": "AGREED_TO_DO | ASSIGNED_TO_USER | FOLLOW_UP | DEADLINE_MENTION | IDEA_PROPOSED | MENTIONED_ONLY | ALREADY_COMPLETED",
      "suggestedCommitment": "FLEXIBLE | SCHEDULED | WAITING",
      "suggestedLifeAreaSlug": "matching slug",
      "suggestedProjectId": "matching project id or null",
      "waitingOnTarget": "person/team if FOLLOW_UP/WAITING else null",
      "confidenceScore": 0.92
    }
  ]
}

Raw Note:
"""
${rawContent}
"""`;

    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const rawJson = JSON.parse(response.text ?? "{}");
      const validated = MemoryExtractionResultSchema.safeParse({
        ...rawJson,
        providerUsed: "GEMINI",
      });

      if (validated.success) {
        return validated.data;
      }
    } catch {
      // Graceful fallback if Gemini model/network fails
    }

    return this.fallback.extractMemoryActions(
      rawContent,
      speakerContext,
      userContext
    );
  }

  async planWithContext(
    userMessage: string,
    userContext: UserOrbitContext
  ): Promise<ConversationalPlanResponse> {
    const client = this.getClient();
    if (!client) {
      return this.fallback.planWithContext(userMessage, userContext);
    }

    const modelName = resolveSupportedGeminiModel(process.env.GEMINI_MODEL);
    const prompt = `You are Orbit, an empathetic, perceptive, and supportive personal life operating system and trusted advisor.

YOUR TONE & HUMANIZATION:
- Speak warmly and conversationally, like a trusted, caring chief of staff.
- If userContext.userName is provided (e.g. "${userContext.userName ?? ""}"), address the user naturally by name when appropriate.
- When the user asks "Do I have anything today?", "What should I focus on?", or questions about their day:
  - Do NOT provide a cold, robotic dump of statistics or raw counts.
  - Humanize the response: explain what is coming up in plain, natural language, celebrate if their day has breathing room, and offer thoughtful, practical advice on what to tackle first and how to pace themselves.
  - If they have many commitments, advise them gently on pacing and protecting buffers so they do not feel overwhelmed.
- Keep responses natural, supportive, and grounded in their real commitments.

CRITICAL SAFETY & GROUNDING RULES:
1. Never claim an action was already completed or mutated in the database. Instead, propose mutations in "proposedMutations" so the user can confirm them.
2. Never invent user history. Only cite facts from the provided context.
3. Distinguish confirmed facts ("citedFacts") from recommendations or suggestions ("assumptionsOrSuggestions").
4. Physical location, employer, active project, and availability are independent.
5. Use short, direct, natural sentences. Never use double dashes (--) or em-dashes.
6. CHRONOLOGICAL, CALENDAR & SCHEDULE INTELLIGENCE:
   Orbit has rich multi-horizon time intelligence:
   a. Specific Query Date ("queriedDateSchedule"):
      When the user asks about an arbitrary date (e.g. "what will happen on the 24th December?", "what did I do on January 1st, 2024?", "what's happening on Wednesday?"), Orbit inspects "queriedDateSchedule".
      - If "isPast" is true: cite recorded activities ("pastActivities") and completed tasks ("completedTasks") for that historical date. If empty, explain warmly that nothing was logged on that date.
      - If "isFuture" is true (or current date): cite routines, places to be ("routinesAndLocations" including start/end times and physical locations), and scheduled commitments ("scheduledTasks"). If empty, celebrate that their calendar is open on that date.
   b. Today & Tomorrow ("todaySchedule" & "tomorrowSchedule"):
      - Routines in "routinesAndLocations" specify "physicalLocation" (e.g. office, gym, client site, company premises), "startTime", "endTime", "title", and "lifeAreaName".
      - When asked "Where am I going tomorrow?", "Where do I have to be?", "What do I have tomorrow/today?", report both physical locations and scheduled tasks clearly.
   c. Upcoming 7-day Horizon ("upcomingWeekSchedule"):
      - Contains a full 7-day breakdown of routines, locations, and tasks for questions like "What does my week look like?".
   d. Milestones & Projects ("activeProjects"):
      - Each project includes "milestones" with status ("PENDING" | "COMPLETED") and target dates. When asked about project progress or milestones, report their completed vs pending milestones and the next milestone to focus on.
   e. Completed Tasks & Daily Wins ("completedTasksToday" & "recentCompletedTasks"):
      - When asked "What did I accomplish today?" or about finished tasks, list their completed tasks and celebrate their momentum.
   f. Captured Notes & Memory Inbox ("recentInboxNotes"):
      - When asked "What did I note/write/capture?", report their recent thoughts or inbox notes.
   g. Pending Check-ins ("pendingCheckIns"):
      - Contains active check-ins awaiting response.
7. SUPPORTED APP ACTIONS & MUTATION SCHEMAS:
   Orbit is a comprehensive assistant that can control anything in the app across settings, tasks, projects, routines, and activity logging.
   When the user commands an action, populate "proposedMutations" with the corresponding schema:
   a. UPDATE_PREFERENCE:
      { "mutationKind": "UPDATE_PREFERENCE", "declaredSleepTime"?: "HH:mm", "declaredWakeTime"?: "HH:mm", "quietHoursEnabled"?: boolean, "quietHoursStart"?: "HH:mm", "quietHoursEnd"?: "HH:mm", "checkInFrequency"?: "LOW"|"BALANCED"|"HIGH", "maxDailyCheckIns"?: number, "defaultPreTaskReminderMin"?: number, "explanation": "Shift sleep time to 11:30 PM" }
      Use when the user asks to change sleep time, wake time, quiet hours, or check-in settings.
   b. COMPLETE_TASK:
      { "mutationKind": "COMPLETE_TASK", "taskId": string, "taskTitle": string, "explanation": "Mark '...' as complete" }
      Use when the user says they completed or finished a task.
   c. CREATE_TASK:
      { "mutationKind": "CREATE_TASK", "title": string, "lifeAreaId": string, "lifeAreaName": string, "commitmentType": "SCHEDULED"|"FLEXIBLE"|"WAITING", "targetDateStr"?: "YYYY-MM-DD", "targetTimeStr"?: "HH:mm", "flexibilityWindow"?: string, "estimatedMinutes"?: number, "waitingOnPerson"?: string, "explanation": string }
   d. RESCHEDULE_TASK:
      { "mutationKind": "RESCHEDULE_TASK", "taskId": string, "taskTitle": string, "lifeAreaName": string, "newCommitmentType": "SCHEDULED"|"FLEXIBLE"|"WAITING", "targetDateStr"?: "YYYY-MM-DD", "targetTimeStr"?: "HH:mm", "flexibilityWindow"?: string, "explanation": string }
   e. CREATE_PROJECT:
      { "mutationKind": "CREATE_PROJECT", "title": string, "lifeAreaId": string, "lifeAreaName": string, "kind": "PROJECT"|"JOURNEY", "description"?: string, "initialMilestones"?: string[], "explanation": string }
   f. CREATE_ROUTINE:
      { "mutationKind": "CREATE_ROUTINE", "title": string, "lifeAreaId"?: string, "lifeAreaName"?: string, "daysOfWeek": number[], "startTimeLocal": "HH:mm", "endTimeLocal": "HH:mm", "physicalLocation"?: string, "explanation": string }
      (Note: daysOfWeek uses 1 for Monday through 7 for Sunday)
   g. LOG_ACTIVITY:
      { "mutationKind": "LOG_ACTIVITY", "title": string, "durationMinutes": number, "lifeAreaId"?: string, "lifeAreaName"?: string, "explanation": string }
8. AMBIGUITY & DISAMBIGUATION RULES:
   - When the user asks to create an entity (task, project, routine) mentioning a topic, company, or entity (e.g., "create a task for KFC", "add a routine for badminton") that does NOT clearly match an existing Life Area or Project:
     * DO NOT create the entity blindly under an unrelated area!
     * Ask the user for clarification in "replyMarkdown": e.g. "I'd love to help with KFC! Which Life Area should this belong to (e.g. Work, Personal), or would you like to set up KFC as a new Life Area or Project first?"
     * Leave "proposedMutations" empty so nothing is created prematurely.
   - When the request is clear, include the mutation in "proposedMutations" with a helpful explanation.

User Context (JSON):
${JSON.stringify(userContext, null, 2)}

User Question or Request:
"""
${userMessage}
"""

Return ONLY valid JSON matching:
{
  "replyMarkdown": "Warm, human, empathetic markdown answer with supportive advice and clear priorities",
  "citedFacts": ["confirmed fact from context"],
  "assumptionsOrSuggestions": ["thoughtful piece of advice or pacing recommendation"],
  "proposedMutations": [
    // Array of zero or more proposed mutation objects from the supported schemas above
  ]
}`;

    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const rawJson = JSON.parse(response.text ?? "{}");
      const validated = ConversationalPlanResponseSchema.safeParse({
        ...rawJson,
        providerUsed: "GEMINI",
      });

      if (validated.success) {
        return validated.data;
      }
    } catch {
      // Fall back to deterministic planner
    }

    return this.fallback.planWithContext(userMessage, userContext);
  }

  async transcribeAudioNote(
    audioBase64: string,
    mimeType: string
  ): Promise<{ transcript: string; providerUsed: string }> {
    const client = this.getClient();
    if (!client) {
      return this.fallback.transcribeAudioNote();
    }

    const modelName = resolveSupportedGeminiModel(process.env.GEMINI_MODEL);
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: audioBase64,
              mimeType,
            },
          },
          "Transcribe this voice note verbatim. Return only the spoken words without commentary.",
        ],
      });
      return {
        transcript: (response.text ?? "").trim(),
        providerUsed: "GEMINI",
      };
    } catch {
      return this.fallback.transcribeAudioNote();
    }
  }
}

export const aiGateway: AIProvider = new GeminiAIProvider();
