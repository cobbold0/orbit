import { EventSchemas, Inngest } from "inngest";

export type OrbitInngestEvents = {
  "orbit/task.scheduled": {
    data: {
      userId: string;
      taskId: string;
      scheduleVersion: number;
      scheduledStartIso: string;
      scheduledEndIso: string;
      preReminderJobId: string | null;
      startJobId: string;
      endJobId: string;
    };
  };
  "orbit/task.rescheduled": {
    data: {
      userId: string;
      taskId: string;
      scheduleVersion: number;
    };
  };
  "orbit/task.completed": {
    data: {
      userId: string;
      taskId: string;
      scheduleVersion: number;
    };
  };
  "orbit/routines.evaluate": {
    data: {
      userId: string;
    };
  };
};

export const inngest = new Inngest({
  id: "orbit",
  schemas: new EventSchemas().fromRecord<OrbitInngestEvents>(),
});
