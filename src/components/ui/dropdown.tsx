"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export function Dropdown({
  label,
  ariaLabel,
  icon,
  variant = "secondary",
  align = "end",
  form = false,
  iconOnly = false,
  children,
}: {
  label?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  align?: "start" | "end";
  form?: boolean;
  iconOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className={`menu-wrap ${align === "end" ? "align-end" : "align-start"}`}
      onToggle={(e) => {
        const details = e.currentTarget;
        const panel = details.querySelector<HTMLElement>(":scope > .panel");
        if (!panel) return;
        panel.style.left = "";
        panel.style.right = "";
        if (!details.open) return;

        const rect = panel.getBoundingClientRect();
        const detailsRect = details.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const gutter = 12;

        if (rect.left < gutter) {
          panel.style.right = "auto";
          panel.style.left = `${gutter - detailsRect.left}px`;
        } else if (rect.right > vw - gutter) {
          panel.style.left = "auto";
          panel.style.right = `${detailsRect.right - (vw - gutter)}px`;
        }
      }}
    >
      <summary
        aria-label={ariaLabel ?? label}
        className={`button button-${variant} ${iconOnly ? "button-icon" : ""}`}
      >
        {icon}
        {label && !iconOnly && <span>{label}</span>}
        {!iconOnly && <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </summary>
      <div className={`panel ${form ? "panel-form" : ""}`}>{children}</div>
    </details>
  );
}
