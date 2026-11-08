import {
  ActivitySource,
  CaptureKind,
  CheckInFrequency,
  CommitmentType,
  ExtractedIntentClassification,
  ExtractedReviewStatus,
  InboxProcessingStatus,
  MilestoneStatus,
  PrismaClient,
  ProjectKind,
  ProjectStatus,
  RoutineKind,
  RoutineState,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Orbit multi-area persona...");

  const user = await prisma.user.upsert({
    where: { email: "alex@orbit.local" },
    update: { name: "Alex Vance" },
    create: {
      id: "user_orbit_primary",
      name: "Alex Vance",
      email: "alex@orbit.local",
      emailVerified: true,
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      ianaTimeZone: "Africa/Lagos",
      morningBriefingEnabled: true,
      morningBriefingTime: "07:30",
      declaredWakeTime: "06:45",
      declaredSleepTime: "23:00",
      quietHoursEnabled: true,
      quietHoursStart: "22:30",
      quietHoursEnd: "07:00",
      maxDailyCheckIns: 5,
      defaultPreTaskReminderMin: 30,
      randomCheckInsEnabled: true,
      checkInFrequency: CheckInFrequency.BALANCED,
      minMinutesBetweenCheckIns: 120,
    },
  });

  // 1. Life Areas
  const areasData = [
    {
      slug: "basilissa",
      name: "Basilissa",
      description:
        "Mon–Tue on-site office attendance + continuous software engineering responsibilities.",
      colorToken: "indigo",
      iconName: "Building2",
      sortOrder: 1,
    },
    {
      slug: "everlyx",
      name: "Everlyx",
      description:
        "Wed–Sat on-site office attendance + core platform architecture and delivery.",
      colorToken: "emerald",
      iconName: "Briefcase",
      sortOrder: 2,
    },
    {
      slug: "music",
      name: "Music",
      description: "Vocal training, DAW mastery, arrangement, mixing, and song production.",
      colorToken: "amber",
      iconName: "Music",
      sortOrder: 3,
    },
    {
      slug: "education",
      name: "Education",
      description: "Weekend classes, coursework, and examination preparation.",
      colorToken: "violet",
      iconName: "GraduationCap",
      sortOrder: 4,
    },
    {
      slug: "personal",
      name: "Personal",
      description: "Personal projects, family commitments, health, and life logistics.",
      colorToken: "slate",
      iconName: "Compass",
      sortOrder: 5,
    },
  ];

  const areaMap: Record<string, string> = {};
  for (const area of areasData) {
    const record = await prisma.lifeArea.upsert({
      where: {
        userId_slug: {
          userId: user.id,
          slug: area.slug,
        },
      },
      update: {
        name: area.name,
        description: area.description,
        colorToken: area.colorToken,
        iconName: area.iconName,
        sortOrder: area.sortOrder,
      },
      create: {
        userId: user.id,
        ...area,
      },
    });
    areaMap[area.slug] = record.id;
  }

  // 2. Projects & Journeys
  const basilissaProject = await prisma.project.upsert({
    where: { id: "proj_basilissa_attendance" },
    update: {},
    create: {
      id: "proj_basilissa_attendance",
      userId: user.id,
      lifeAreaId: areaMap.basilissa!,
      title: "Build Attendance Management System",
      description:
        "End-to-end staff attendance dashboard, biometric/Odoo API sync, and mobile staff check-in verification.",
      contextNote:
        "CEO priority before next management review. Can be worked on during evening focus blocks outside Mon-Tue office days.",
      kind: ProjectKind.PROJECT,
      status: ProjectStatus.ACTIVE,
      sortOrder: 1,
    },
  });

  const everlyxProject = await prisma.project.upsert({
    where: { id: "proj_everlyx_modernize" },
    update: {},
    create: {
      id: "proj_everlyx_modernize",
      userId: user.id,
      lifeAreaId: areaMap.everlyx!,
      title: "Modernize Core Operations Application",
      description:
        "Migrate legacy reporting views and harden webhook reliability for Everlyx operations.",
      kind: ProjectKind.PROJECT,
      status: ProjectStatus.ACTIVE,
      sortOrder: 2,
    },
  });

  const musicJourney = await prisma.project.upsert({
    where: { id: "journey_music_production" },
    update: {},
    create: {
      id: "journey_music_production",
      userId: user.id,
      lifeAreaId: areaMap.music!,
      title: "Produce a Complete Original Song",
      description:
        "Structured progression from DAW fundamentals and vocal control to a fully mixed original release.",
      kind: ProjectKind.JOURNEY,
      status: ProjectStatus.ACTIVE,
      sortOrder: 3,
    },
  });

  const examProject = await prisma.project.upsert({
    where: { id: "proj_education_exam" },
    update: {},
    create: {
      id: "proj_education_exam",
      userId: user.id,
      lifeAreaId: areaMap.education!,
      title: "Weekend Examination Preparation",
      description: "Synthesize lecture modules and complete practice papers ahead of weekend assessment.",
      kind: ProjectKind.PROJECT,
      status: ProjectStatus.ACTIVE,
      sortOrder: 4,
    },
  });

  // 3. Music Journey Milestones
  const musicMilestones = [
    {
      id: "ms_music_1",
      title: "Understand the DAW",
      description: "Routing, session templates, key commands, and audio interface latency.",
      sortOrder: 1,
      status: MilestoneStatus.COMPLETED,
    },
    {
      id: "ms_music_2",
      title: "Learn beat arrangement",
      description: "Drum programming, groove pocket, and section transitions.",
      sortOrder: 2,
      status: MilestoneStatus.IN_PROGRESS,
    },
    {
      id: "ms_music_3",
      title: "Learn vocal recording",
      description: "Mic technique, gain staging, comping takes, and pitch control.",
      sortOrder: 3,
      status: MilestoneStatus.UPCOMING,
    },
    {
      id: "ms_music_4",
      title: "Understand mixing",
      description: "EQ carving, compression dynamics, spatial reverb/delay balance.",
      sortOrder: 4,
      status: MilestoneStatus.UPCOMING,
    },
    {
      id: "ms_music_5",
      title: "Produce a complete song",
      description: "Arrange, record vocals, mix, and bounce a finished master.",
      sortOrder: 5,
      status: MilestoneStatus.UPCOMING,
    },
  ];

  for (const ms of musicMilestones) {
    await prisma.projectMilestone.upsert({
      where: { id: ms.id },
      update: { status: ms.status, sortOrder: ms.sortOrder },
      create: {
        ...ms,
        projectId: musicJourney.id,
      },
    });
  }

  // 4. Routines (Declared vs. Observed vs. Suggested + Physical Location Windows)
  await prisma.routine.upsert({
    where: { id: "routine_basilissa_office" },
    update: {},
    create: {
      id: "routine_basilissa_office",
      userId: user.id,
      lifeAreaId: areaMap.basilissa!,
      title: "Basilissa Office Presence",
      description: "On-site engineering & stakeholder alignment days.",
      kind: RoutineKind.LOCATION_WINDOW,
      state: RoutineState.DECLARED,
      physicalLocation: "Basilissa Office",
      daysOfWeek: [1, 2], // Mon, Tue
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
    },
  });

  await prisma.routine.upsert({
    where: { id: "routine_everlyx_office" },
    update: {},
    create: {
      id: "routine_everlyx_office",
      userId: user.id,
      lifeAreaId: areaMap.everlyx!,
      title: "Everlyx Office Presence",
      description: "Physical presence at Everlyx HQ from Wednesday through Saturday.",
      kind: RoutineKind.LOCATION_WINDOW,
      state: RoutineState.DECLARED,
      physicalLocation: "Everlyx Office",
      daysOfWeek: [3, 4, 5, 6], // Wed, Thu, Fri, Sat
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
    },
  });

  await prisma.routine.upsert({
    where: { id: "routine_music_suggested" },
    update: {},
    create: {
      id: "routine_music_suggested",
      userId: user.id,
      lifeAreaId: areaMap.music!,
      title: "Evening Vocal & Beat Practice (20:30 instead of 19:00)",
      description: "Shift practice 90 minutes later on Wed/Fri to account for Everlyx commute recovery.",
      kind: RoutineKind.HABIT,
      state: RoutineState.SUGGESTED,
      physicalLocation: "Home Studio",
      daysOfWeek: [3, 5],
      startTimeLocal: "20:30",
      endTimeLocal: "21:30",
      confidenceScore: 0.86,
      suggestionReasoning:
        "Over the last 3 weeks, 19:00 music sessions on Everlyx office days were postponed 4 times because commute + dinner wrapped around 20:10. Sessions started after 20:30 had a 90% completion rate.",
    },
  });

  // 5. Tasks (Scheduled, Flexible, Waiting)
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(9, 0, 0, 0);

  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  await prisma.task.upsert({
    where: { id: "task_everlyx_sync" },
    update: {},
    create: {
      id: "task_everlyx_sync",
      userId: user.id,
      lifeAreaId: areaMap.everlyx!,
      projectId: everlyxProject.id,
      title: "Review Everlyx operations webhook telemetry",
      description: "Verify retry backoff behavior and inspect latency distribution.",
      commitmentType: CommitmentType.SCHEDULED,
      status: TaskStatus.ACTIVE,
      priority: TaskPriority.HIGH,
      estimatedMinutes: 60,
      scheduledStart: inOneHour,
      scheduledEnd: inTwoHours,
    },
  });

  await prisma.task.upsert({
    where: { id: "task_basilissa_dashboard_elapsed" },
    update: {},
    create: {
      id: "task_basilissa_dashboard_elapsed",
      userId: user.id,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      title: "Refine Basilissa attendance dashboard exception filters",
      description: "Add late arrival and missing checkout filter states before management demo.",
      commitmentType: CommitmentType.SCHEDULED,
      // Principle #4: Scheduled window passed without confirmation -> NEEDS_CHECKIN, never auto-completed
      status: TaskStatus.NEEDS_CHECKIN,
      priority: TaskPriority.HIGH,
      estimatedMinutes: 60,
      scheduledStart: twoHoursAgo,
      scheduledEnd: oneHourAgo,
    },
  });

  await prisma.task.upsert({
    where: { id: "task_basilissa_odoo_waiting" },
    update: {},
    create: {
      id: "task_basilissa_odoo_waiting",
      userId: user.id,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      title: "Integrate Odoo attendance payload endpoint",
      description: "Map employee badge IDs to Odoo HR attendance records.",
      commitmentType: CommitmentType.WAITING,
      status: TaskStatus.ACTIVE,
      priority: TaskPriority.HIGH,
      waitingOnPerson: "Odoo Developer",
      waitingOnCondition: "Updated attendance webhook payload schema & staging credentials",
      waitingSince: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
  });

  await prisma.task.upsert({
    where: { id: "task_music_drum_arrangement" },
    update: {},
    create: {
      id: "task_music_drum_arrangement",
      userId: user.id,
      lifeAreaId: areaMap.music!,
      projectId: musicJourney.id,
      milestoneId: "ms_music_2",
      title: "Arrange 16-bar verse-to-chorus drum transition in DAW",
      description: "Practice hi-hat velocity humanization and turnaround fills.",
      commitmentType: CommitmentType.FLEXIBLE,
      status: TaskStatus.ACTIVE,
      priority: TaskPriority.NORMAL,
      estimatedMinutes: 45,
      flexibilityWindow: "THIS_EVENING",
    },
  });

  await prisma.task.upsert({
    where: { id: "task_education_past_paper" },
    update: {},
    create: {
      id: "task_education_past_paper",
      userId: user.id,
      lifeAreaId: areaMap.education!,
      projectId: examProject.id,
      title: "Complete Section B practice examination questions",
      description: "Focus on timed written responses before Saturday class.",
      commitmentType: CommitmentType.FLEXIBLE,
      status: TaskStatus.ACTIVE,
      priority: TaskPriority.HIGH,
      estimatedMinutes: 50,
      flexibilityWindow: "THIS_WEEK",
      dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  // 6. Memory Inbox Entry (CEO Conversation Example from Brief)
  const ceoInbox = await prisma.memoryInboxEntry.upsert({
    where: { id: "inbox_ceo_discussion" },
    update: {},
    create: {
      id: "inbox_ceo_discussion",
      userId: user.id,
      title: "Catch-up with Basilissa CEO on Attendance System",
      rawContent:
        "Spoke with the CEO this morning. We agreed I will improve the attendance dashboard summary view and contact the Odoo developer about the attendance APIs. We also need to prepare the staff application for internal testing and present progress before the next management meeting. He also casually mentioned they might explore a cafeteria kiosk next year, and noted that the initial server provisioning is already completed.",
      captureKind: CaptureKind.MEETING_NOTES,
      processingStatus: InboxProcessingStatus.EXTRACTED_PENDING_REVIEW,
      speakerContext: "Conversation with Basilissa CEO",
      aiSummary:
        "4 actionable commitments/follow-ups identified for the Basilissa Attendance project, separated from 1 future idea mention and 1 already-completed item.",
    },
  });

  const extractedItems = [
    {
      id: "ext_ceo_1",
      title: "Improve attendance dashboard summary view",
      sourceQuote: "We agreed I will improve the attendance dashboard summary view",
      classification: ExtractedIntentClassification.AGREED_TO_DO,
      suggestedCommitment: CommitmentType.FLEXIBLE,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      confidenceScore: 0.96,
    },
    {
      id: "ext_ceo_2",
      title: "Contact Odoo developer regarding attendance APIs",
      sourceQuote: "contact the Odoo developer about the attendance APIs",
      classification: ExtractedIntentClassification.FOLLOW_UP,
      suggestedCommitment: CommitmentType.FLEXIBLE,
      waitingOnTarget: "Odoo Developer",
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      confidenceScore: 0.94,
    },
    {
      id: "ext_ceo_3",
      title: "Prepare staff application build for internal testing",
      sourceQuote: "prepare the staff application for internal testing",
      classification: ExtractedIntentClassification.ASSIGNED_TO_USER,
      suggestedCommitment: CommitmentType.FLEXIBLE,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      confidenceScore: 0.92,
    },
    {
      id: "ext_ceo_4",
      title: "Present attendance system progress before next management meeting",
      sourceQuote: "present progress before the next management meeting",
      classification: ExtractedIntentClassification.DEADLINE_MENTION,
      suggestedCommitment: CommitmentType.FLEXIBLE,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      confidenceScore: 0.91,
    },
    {
      id: "ext_ceo_5",
      title: "Cafeteria kiosk exploration next year",
      sourceQuote: "He also casually mentioned they might explore a cafeteria kiosk next year",
      classification: ExtractedIntentClassification.MENTIONED_ONLY,
      suggestedCommitment: CommitmentType.FLEXIBLE,
      lifeAreaId: areaMap.basilissa!,
      confidenceScore: 0.89,
    },
    {
      id: "ext_ceo_6",
      title: "Initial server provisioning",
      sourceQuote: "noted that the initial server provisioning is already completed",
      classification: ExtractedIntentClassification.ALREADY_COMPLETED,
      suggestedCommitment: CommitmentType.FLEXIBLE,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      confidenceScore: 0.95,
    },
  ];

  for (const item of extractedItems) {
    await prisma.extractedAction.upsert({
      where: { id: item.id },
      update: {},
      create: {
        ...item,
        inboxEntryId: ceoInbox.id,
        reviewStatus: ExtractedReviewStatus.PENDING_REVIEW,
      },
    });
  }

  // 7. Sample Activity Records (Confirmed vs. AI Inferred)
  await prisma.activityRecord.upsert({
    where: { id: "act_confirmed_1" },
    update: {},
    create: {
      id: "act_confirmed_1",
      userId: user.id,
      lifeAreaId: areaMap.basilissa!,
      projectId: basilissaProject.id,
      title: "Fixed API integration auth headers for Basilissa attendance service",
      physicalLocation: "Everlyx Office (Evening break)",
      startedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      endedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      durationMinutes: 60,
      source: ActivitySource.CHECKIN_RESPONSE,
      isConfirmed: true,
    },
  });

  await prisma.activityRecord.upsert({
    where: { id: "act_inferred_1" },
    update: {},
    create: {
      id: "act_inferred_1",
      userId: user.id,
      lifeAreaId: areaMap.everlyx!,
      projectId: everlyxProject.id,
      title: "Attended Everlyx morning engineering standup",
      physicalLocation: "Everlyx Office",
      startedAt: todayStart,
      durationMinutes: 30,
      source: ActivitySource.AI_INFERRED,
      isConfirmed: false,
      confidenceScore: 0.78,
    },
  });

  console.log("Orbit persona seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
