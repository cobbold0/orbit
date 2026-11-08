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

    // Case 3: Contextual Query, Today's agenda, or Priority Advice
    const scheduledTasks = userContext.openTasks.filter(
      (t) => t.commitmentType === "SCHEDULED"
    );
    const flexibleTasks = userContext.openTasks.filter(
      (t) => t.commitmentType === "FLEXIBLE"
    );
    const waitingTasks = userContext.openTasks.filter(
      (t) => t.commitmentType === "WAITING"
    );

    const isTodayQuery = /\b(?:today|now|tonight|this\s+afternoon|this\s+morning|day|schedule|agenda)\b/i.test(lower);

    let replyMarkdown = "";
    let advice = "";

    if (isTodayQuery) {
      if (scheduledTasks.length === 0 && flexibleTasks.length === 0) {
        replyMarkdown = `Your day is completely open! You don't have any scheduled appointments or deadlines on your calendar today.\n\nEnjoy the breathing room to recharge, or feel free to jot down any new thoughts whenever inspiration strikes.`;
        advice = "No urgent demands today. Take time to rest or explore personal interests.";
      } else if (scheduledTasks.length > 0) {
        const scheduledList = scheduledTasks
          .slice(0, 4)
          .map((t) => `• ${t.title} (${t.lifeAreaName})`)
          .join("\n");
        const flexNote = flexibleTasks.length > 0
          ? `\n\nYou also have ${flexibleTasks.length} flexible task${flexibleTasks.length > 1 ? "s" : ""} on deck if you find extra time.`
          : "";
        replyMarkdown = `Here is how your day is shaping up:\n\n${scheduledList}${flexNote}\n\nMy advice: start with "${scheduledTasks[0]?.title}" to build quick momentum early, and remember to leave a buffer between blocks so you don't feel rushed.`;
        advice = `Focus on "${scheduledTasks[0]?.title}" first to lock in an early win.`;
      } else {
        const flexList = flexibleTasks
          .slice(0, 3)
          .map((t) => `• ${t.title} (${t.lifeAreaName})`)
          .join("\n");
        replyMarkdown = `You have no hard-scheduled appointments today, which gives you great freedom.\n\nYou do have ${flexibleTasks.length} flexible item${flexibleTasks.length > 1 ? "s" : ""} you could look at:\n\n${flexList}\n\nMy advice: pick "${flexibleTasks[0]?.title}" for a focused 30 to 45 minute sprint while your energy is fresh, and keep the rest of your day relaxed.`;
        advice = `Tackle "${flexibleTasks[0]?.title}" when ready, with no rigid schedule constraints.`;
      }
    } else {
      if (userContext.openTasks.length === 0) {
        replyMarkdown = `Everything is currently clear across your areas! No open tasks or pending follow-ups are waiting.\n\nWhenever something comes to mind, you can ask me to capture a task, note, or log your work.`;
        advice = "All caught up. Good time for reflection or planning ahead.";
      } else {
        const topTasks = userContext.openTasks.slice(0, 4);
        const taskList = topTasks
          .map((t) => `• ${t.title} (${t.lifeAreaName})`)
          .join("\n");
        replyMarkdown = `Here are your main priorities across areas:\n\n${taskList}\n\nMy recommendation: prioritize "${topTasks[0]?.title}" first. Getting that across the finish line will free up mental clarity for everything else.`;
        advice = `Start with "${topTasks[0]?.title}" to create positive momentum.`;
      }
    }

    return {
      replyMarkdown,
      citedFacts: [
        `${scheduledTasks.length} scheduled, ${flexibleTasks.length} flexible, and ${waitingTasks.length} waiting tasks active.`,
        `Local date in ${userContext.ianaTimeZone}: ${userContext.localDate}.`,
      ],
      assumptionsOrSuggestions: [advice],
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
    // Either RESCHEDULE_TASK or CREATE_TASK objects if the user asked to schedule, move, or create a task
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
