"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/page";
import {
  AreaFilterBar,
  type FilterableAreaItem,
} from "@/components/areas/area-filter-bar";
import {
  ProjectCard,
  type ProjectCardData,
} from "@/components/areas/project-card";
import {
  ProjectModal,
  type ProjectModalAreaOption,
} from "@/components/modals/project-modal";

export function AllProjectsClient({
  areas,
  areaOptions,
  selectedSlug,
  selectedAreaId,
  projects,
}: {
  areas: FilterableAreaItem[];
  areaOptions: ProjectModalAreaOption[];
  selectedSlug?: string;
  selectedAreaId?: string;
  projects: ProjectCardData[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filteredProjects = q
    ? projects.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false) ||
          (p.lifeArea?.name.toLowerCase().includes(q) ?? false)
      )
    : projects;

  return (
    <div className="space-y-5">
      <AreaFilterBar
        areas={areas}
        selectedSlug={selectedSlug}
        query={query}
        onQueryChange={setQuery}
        basePath="/areas/projects"
        searchPlaceholder="Search projects"
      />

      {filteredProjects.length === 0 ? (
        <Card title={q ? "No matching projects" : "No active projects"}>
          <div className="orbit-row">
            <p className="meta orbit-row-main">
              {q
                ? "Try a different search term."
                : "Create a project or long-term journey to track milestones."}
            </p>
            {!q && (
              <ProjectModal
                mode="create"
                lifeAreas={areaOptions}
                defaultAreaId={selectedAreaId}
                triggerClassName="btn btn-secondary btn-sm"
              />
            )}
          </div>
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              lifeAreas={areaOptions}
              showAreaLink={!selectedSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}
