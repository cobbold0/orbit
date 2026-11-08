-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CheckInFrequency" AS ENUM ('MINIMAL', 'BALANCED', 'PROACTIVE');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('PROJECT', 'JOURNEY');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM ('SCHEDULED', 'FLEXIBLE', 'WAITING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ACTIVE', 'IN_PROGRESS', 'NEEDS_CHECKIN', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScheduleChangeReason" AS ENUM ('INITIAL_SCHEDULE', 'USER_RESCHEDULED', 'MOVED_TO_FLEXIBLE', 'MOVED_TO_WAITING', 'DID_NOT_START', 'INTERRUPTED', 'AI_PROPOSED_USER_APPROVED');

-- CreateEnum
CREATE TYPE "RoutineKind" AS ENUM ('LOCATION_WINDOW', 'WORK_BLOCK', 'HABIT', 'CLASS_SCHEDULE');

-- CreateEnum
CREATE TYPE "RoutineState" AS ENUM ('DECLARED', 'OBSERVED', 'SUGGESTED');

-- CreateEnum
CREATE TYPE "RoutineAdherenceStatus" AS ENUM ('MATCHED', 'SHIFTED', 'SKIPPED', 'UNCONFIRMED');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('USER_CONFIRMED', 'CHECKIN_RESPONSE', 'TASK_COMPLETION', 'IMPORTED', 'AI_INFERRED');

-- CreateEnum
CREATE TYPE "CaptureKind" AS ENUM ('TEXT_NOTE', 'VOICE_NOTE', 'MEETING_NOTES', 'PASTED_MESSAGE', 'QUICK_THOUGHT');

-- CreateEnum
CREATE TYPE "InboxProcessingStatus" AS ENUM ('RAW_UNPROCESSED', 'PROCESSING', 'EXTRACTED_PENDING_REVIEW', 'REVIEWED', 'FAILED_RETRYABLE');

-- CreateEnum
CREATE TYPE "ExtractedIntentClassification" AS ENUM ('AGREED_TO_DO', 'ASSIGNED_TO_USER', 'FOLLOW_UP', 'DEADLINE_MENTION', 'IDEA_PROPOSED', 'MENTIONED_ONLY', 'ALREADY_COMPLETED');

-- CreateEnum
CREATE TYPE "ExtractedReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "BackgroundJobKind" AS ENUM ('MORNING_BRIEFING', 'PRE_TASK_REMINDER', 'TASK_START_CONFIRMATION', 'TASK_END_CONFIRMATION', 'RANDOM_CHECKIN', 'MEMORY_INBOX_EXTRACTION', 'ROUTINE_EVALUATION');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('MORNING_BRIEFING', 'PRE_COMMITMENT_CHECKIN', 'START_CONFIRMATION', 'END_CONFIRMATION', 'NEXT_COMMITMENT', 'RANDOM_CHECKIN', 'UNREVIEWED_MEMORY_NUDGE');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'READ', 'RESPONDED', 'SNOOZED', 'DISMISSED', 'SUPPRESSED_QUIET_HOURS', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(6),
    "refreshTokenExpiresAt" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ianaTimeZone" TEXT NOT NULL DEFAULT 'UTC',
    "morningBriefingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "morningBriefingTime" TEXT NOT NULL DEFAULT '07:30',
    "declaredWakeTime" TEXT NOT NULL DEFAULT '07:00',
    "declaredSleepTime" TEXT NOT NULL DEFAULT '23:00',
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '07:00',
    "maxDailyCheckIns" INTEGER NOT NULL DEFAULT 6,
    "defaultPreTaskReminderMin" INTEGER NOT NULL DEFAULT 30,
    "randomCheckInsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkInFrequency" "CheckInFrequency" NOT NULL DEFAULT 'BALANCED',
    "minMinutesBetweenCheckIns" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "life_area" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "iconName" TEXT NOT NULL DEFAULT 'CircleDot',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "life_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lifeAreaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contextNote" TEXT,
    "kind" "ProjectKind" NOT NULL DEFAULT 'PROJECT',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMPTZ(6),
    "targetDate" TIMESTAMPTZ(6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'UPCOMING',
    "targetDate" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lifeAreaId" TEXT NOT NULL,
    "projectId" TEXT,
    "milestoneId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contextNotes" TEXT,
    "commitmentType" "CommitmentType" NOT NULL DEFAULT 'FLEXIBLE',
    "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "estimatedMinutes" INTEGER,
    "dueDate" TIMESTAMPTZ(6),
    "scheduledStart" TIMESTAMPTZ(6),
    "scheduledEnd" TIMESTAMPTZ(6),
    "flexibilityWindow" TEXT,
    "waitingOnPerson" TEXT,
    "waitingOnCondition" TEXT,
    "waitingSince" TIMESTAMPTZ(6),
    "scheduleVersion" INTEGER NOT NULL DEFAULT 1,
    "postponeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_schedule_history" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "previousVersion" INTEGER NOT NULL,
    "newVersion" INTEGER NOT NULL,
    "previousCommitment" "CommitmentType" NOT NULL,
    "newCommitment" "CommitmentType" NOT NULL,
    "previousStart" TIMESTAMPTZ(6),
    "previousEnd" TIMESTAMPTZ(6),
    "newStart" TIMESTAMPTZ(6),
    "newEnd" TIMESTAMPTZ(6),
    "reason" "ScheduleChangeReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_schedule_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependency" (
    "id" TEXT NOT NULL,
    "dependentTaskId" TEXT NOT NULL,
    "prerequisiteTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lifeAreaId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "RoutineKind" NOT NULL DEFAULT 'WORK_BLOCK',
    "state" "RoutineState" NOT NULL DEFAULT 'DECLARED',
    "physicalLocation" TEXT,
    "daysOfWeek" INTEGER[],
    "startTimeLocal" TEXT NOT NULL,
    "endTimeLocal" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "suggestionReasoning" TEXT,
    "relatedDeclaredId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_occurrence" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "occurrenceDate" TEXT NOT NULL,
    "expectedStart" TIMESTAMPTZ(6) NOT NULL,
    "expectedEnd" TIMESTAMPTZ(6) NOT NULL,
    "actualStart" TIMESTAMPTZ(6),
    "actualEnd" TIMESTAMPTZ(6),
    "status" "RoutineAdherenceStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_record" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lifeAreaId" TEXT,
    "projectId" TEXT,
    "milestoneId" TEXT,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "physicalLocation" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "endedAt" TIMESTAMPTZ(6),
    "durationMinutes" INTEGER,
    "source" "ActivitySource" NOT NULL DEFAULT 'USER_CONFIRMED',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_inbox_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "rawContent" TEXT NOT NULL,
    "captureKind" "CaptureKind" NOT NULL DEFAULT 'TEXT_NOTE',
    "processingStatus" "InboxProcessingStatus" NOT NULL DEFAULT 'RAW_UNPROCESSED',
    "voiceDurationSec" INTEGER,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "speakerContext" TEXT,
    "aiSummary" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "memory_inbox_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_action" (
    "id" TEXT NOT NULL,
    "inboxEntryId" TEXT NOT NULL,
    "lifeAreaId" TEXT,
    "projectId" TEXT,
    "materializedTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceQuote" TEXT,
    "classification" "ExtractedIntentClassification" NOT NULL,
    "suggestedCommitment" "CommitmentType" NOT NULL DEFAULT 'FLEXIBLE',
    "suggestedDueDate" TIMESTAMPTZ(6),
    "suggestedScheduledAt" TIMESTAMPTZ(6),
    "waitingOnTarget" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "reviewStatus" "ExtractedReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" "BackgroundJobKind" NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
    "taskScheduleVersion" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "inngestEventId" TEXT,
    "inngestRunId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "supersededByJobId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "executedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),

    CONSTRAINT "background_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "inngestEventId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "backgroundJobId" TEXT,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT NOT NULL,
    "metadata" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "responseValue" TEXT,
    "responseNote" TEXT,
    "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
    "deliveredAt" TIMESTAMPTZ(6),
    "readAt" TIMESTAMPTZ(6),
    "respondedAt" TIMESTAMPTZ(6),
    "dismissedAt" TIMESTAMPTZ(6),
    "snoozedUntil" TIMESTAMPTZ(6),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preference_userId_key" ON "user_preference"("userId");

-- CreateIndex
CREATE INDEX "life_area_userId_isArchived_sortOrder_idx" ON "life_area"("userId", "isArchived", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "life_area_userId_slug_key" ON "life_area"("userId", "slug");

-- CreateIndex
CREATE INDEX "project_userId_status_idx" ON "project"("userId", "status");

-- CreateIndex
CREATE INDEX "project_userId_lifeAreaId_idx" ON "project"("userId", "lifeAreaId");

-- CreateIndex
CREATE INDEX "project_milestone_projectId_sortOrder_idx" ON "project_milestone"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "task_userId_status_commitmentType_idx" ON "task"("userId", "status", "commitmentType");

-- CreateIndex
CREATE INDEX "task_userId_scheduledStart_scheduledEnd_idx" ON "task"("userId", "scheduledStart", "scheduledEnd");

-- CreateIndex
CREATE INDEX "task_userId_dueDate_idx" ON "task"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "task_userId_lifeAreaId_idx" ON "task"("userId", "lifeAreaId");

-- CreateIndex
CREATE INDEX "task_schedule_history_taskId_createdAt_idx" ON "task_schedule_history"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependency_dependentTaskId_prerequisiteTaskId_key" ON "task_dependency"("dependentTaskId", "prerequisiteTaskId");

-- CreateIndex
CREATE INDEX "routine_userId_state_isActive_idx" ON "routine"("userId", "state", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "routine_occurrence_routineId_occurrenceDate_key" ON "routine_occurrence"("routineId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "activity_record_userId_startedAt_idx" ON "activity_record"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "activity_record_userId_lifeAreaId_isConfirmed_idx" ON "activity_record"("userId", "lifeAreaId", "isConfirmed");

-- CreateIndex
CREATE INDEX "memory_inbox_entry_userId_processingStatus_createdAt_idx" ON "memory_inbox_entry"("userId", "processingStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_action_materializedTaskId_key" ON "extracted_action"("materializedTaskId");

-- CreateIndex
CREATE INDEX "extracted_action_inboxEntryId_reviewStatus_idx" ON "extracted_action"("inboxEntryId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "background_job_idempotencyKey_key" ON "background_job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "background_job_userId_status_scheduledFor_idx" ON "background_job"("userId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "background_job_taskId_status_idx" ON "background_job"("taskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_idempotencyKey_key" ON "outbox_event"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outbox_event_status_nextAttemptAt_idx" ON "outbox_event"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_event_userId_createdAt_idx" ON "outbox_event"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_idempotencyKey_key" ON "notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "notification_userId_status_scheduledFor_idx" ON "notification"("userId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_userId_isActive_idx" ON "push_subscription"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "life_area" ADD CONSTRAINT "life_area_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_lifeAreaId_fkey" FOREIGN KEY ("lifeAreaId") REFERENCES "life_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_lifeAreaId_fkey" FOREIGN KEY ("lifeAreaId") REFERENCES "life_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_schedule_history" ADD CONSTRAINT "task_schedule_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_dependentTaskId_fkey" FOREIGN KEY ("dependentTaskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_prerequisiteTaskId_fkey" FOREIGN KEY ("prerequisiteTaskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine" ADD CONSTRAINT "routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine" ADD CONSTRAINT "routine_lifeAreaId_fkey" FOREIGN KEY ("lifeAreaId") REFERENCES "life_area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_occurrence" ADD CONSTRAINT "routine_occurrence_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_lifeAreaId_fkey" FOREIGN KEY ("lifeAreaId") REFERENCES "life_area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_inbox_entry" ADD CONSTRAINT "memory_inbox_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_action" ADD CONSTRAINT "extracted_action_inboxEntryId_fkey" FOREIGN KEY ("inboxEntryId") REFERENCES "memory_inbox_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_action" ADD CONSTRAINT "extracted_action_lifeAreaId_fkey" FOREIGN KEY ("lifeAreaId") REFERENCES "life_area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_action" ADD CONSTRAINT "extracted_action_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_action" ADD CONSTRAINT "extracted_action_materializedTaskId_fkey" FOREIGN KEY ("materializedTaskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_job" ADD CONSTRAINT "background_job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_job" ADD CONSTRAINT "background_job_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_backgroundJobId_fkey" FOREIGN KEY ("backgroundJobId") REFERENCES "background_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

