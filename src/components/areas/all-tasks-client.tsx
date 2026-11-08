"use client";

import React, { useState } from "react";
import {
  AreaFilterBar,
  type FilterableAreaItem,
} from "@/components/areas/area-filter-bar";
import {
  TasksCard,
  type AreaTaskRowItem,
} from "@/components/areas/tasks-card";

export function AllTasksClient({
  areas,
  selectedSlug,
  tasks,
}: {
  areas: FilterableAreaItem[];
  selectedSlug?: string;
  tasks: AreaTaskRowItem[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filteredTasks = q
    ? tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.projectTitle?.toLowerCase().includes(q) ?? false) ||
          (t.lifeArea?.name.toLowerCase().includes(q) ?? false)
      )
    : tasks;

  return (
    <div className="space-y-5">
      <AreaFilterBar
        areas={areas}
        selectedSlug={selectedSlug}
        query={query}
        onQueryChange={setQuery}
        basePath="/areas/tasks"
        searchPlaceholder="Search tasks"
      />
      <TasksCard
        tasks={filteredTasks}
        lifeAreas={areas}
        showAreaLabel={!selectedSlug}
      />
    </div>
  );
}
