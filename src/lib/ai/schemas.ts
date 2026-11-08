import { z } from "zod";

export const ExtractedClassificationSchema = z.enum([
  "AGREED_TO_DO",
  "ASSIGNED_TO_USER",
  "FOLLOW_UP",
  "DEADLINE_MENTION",
  "IDEA_PROPOSED",
  "MENTIONED_ONLY",
  "ALREADY_COMPLETED",
]);

export const CandidateActionItemSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional().nullable(),
  sourceQuote: z.string().min(1),
  classification: ExtractedClassificationSchema,
  suggestedCommitment: z.enum(["FLEXIBLE", "SCHEDULED", "WAITING"]).default("FLEXIBLE"),
  suggestedLifeAreaSlug: z.string().optional().nullable(),
  suggestedProjectId: z.string().optional().nullable(),
  waitingOnTarget: z.string().optional().nullable(),
  suggestedDueDateIso: z.string().optional().nullable(),
  suggestedScheduledStartIso: z.string().optional().nullable(),
  confidenceScore: z.number().min(0).max(1).default(0.85),
});

export const MemoryExtractionResultSchema = z.object({
  summary: z.string().min(5),
  items: z.array(CandidateActionItemSchema),
  providerUsed: z.enum(["GEMINI", "DETERMINISTIC_FALLBACK"]),
});

export type CandidateActionItem = z.infer<typeof CandidateActionItemSchema>;
export type MemoryExtractionResult = z.infer<typeof MemoryExtractionResultSchema>;

export const ProposedMutationSchema = z.discriminatedUnion("mutationKind", [
  z.object({
    mutationKind: z.literal("RESCHEDULE_TASK"),
    taskId: z.string(),
    taskTitle: z.string(),
    lifeAreaName: z.string(),
    newCommitmentType: z.enum(["SCHEDULED", "FLEXIBLE", "WAITING"]),
    targetDateStr: z.string().optional().nullable(),
    targetTimeStr: z.string().optional().nullable(),
    flexibilityWindow: z.string().optional().nullable(),
    explanation: z.string(),
  }),
  z.object({
    mutationKind: z.literal("CREATE_TASK"),
    title: z.string(),
    lifeAreaId: z.string(),
    lifeAreaName: z.string(),
    commitmentType: z.enum(["SCHEDULED", "FLEXIBLE", "WAITING"]),
    targetDateStr: z.string().optional().nullable(),
    targetTimeStr: z.string().optional().nullable(),
    flexibilityWindow: z.string().optional().nullable(),
    estimatedMinutes: z.number().optional().nullable(),
    waitingOnPerson: z.string().optional().nullable(),
    explanation: z.string(),
  }),
]);

export const ConversationalPlanResponseSchema = z.object({
  replyMarkdown: z.string(),
  citedFacts: z.array(z.string()),
  assumptionsOrSuggestions: z.array(z.string()),
  proposedMutations: z.array(ProposedMutationSchema),
  providerUsed: z.enum(["GEMINI", "DETERMINISTIC_FALLBACK"]),
});

export type ProposedMutation = z.infer<typeof ProposedMutationSchema>;
export type ConversationalPlanResponse = z.infer<
  typeof ConversationalPlanResponseSchema
>;
