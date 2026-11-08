import React from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  CircleDot,
  Code2,
  Compass,
  Dumbbell,
  FolderKanban,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Music,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getLifeAreaStyle } from "@/lib/design/tokens";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Single-line header row on both mobile and desktop:
 * title stays on the left, primary action stays on the exact same line on the right,
 * and optional subtitle sits cleanly underneath.
 */
export function PageHeader({
  title,
  leading,
  breadcrumbs,
  subtitle,
  children,
}: {
  title: string;
  leading?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-1.5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="breadcrumbs py-0 text-sm">
          <ul>
            {breadcrumbs.map((crumb, idx) => (
              <li key={idx}>
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-[var(--text-2)] hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-base-content">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {leading}
          <h1 className="h1 truncate">{title}</h1>
        </div>
        {children && (
          <div className="flex shrink-0 items-center gap-1.5">{children}</div>
        )}
      </div>
      {subtitle && <div className="meta">{subtitle}</div>}
    </header>
  );
}

/**
 * Single-level DaisyUI card (`card bg-base-200`).
 * Never nest a Card inside another Card.
 */
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 bg-base-200 shadow-2xs ${className}`}>
      <div className="card-body gap-0 p-5 sm:p-6 [--card-fs:1rem]">
        {(title || action) && (
          <div className="mb-1 flex items-start justify-between gap-2.5">
            {title ? (
              <h2 className="h2 min-w-0 flex-1">{title}</h2>
            ) : (
              <span />
            )}
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

const AREA_ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Briefcase,
  Code2,
  FolderKanban,
  GraduationCap,
  Music,
  Compass,
  Heart,
  Dumbbell,
  Home,
  Wallet,
  Globe,
  CircleDot,
};

export function getAreaIconComponent(iconName?: string | null): LucideIcon {
  if (iconName) {
    return AREA_ICON_MAP[iconName] ?? CircleDot;
  }
  return CircleDot;
}

export function AreaIconBadge({
  iconName,
  token,
  size = "md",
}: {
  iconName?: string | null;
  token?: string | null;
  size?: "sm" | "md";
}) {
  const style = getLifeAreaStyle(token);
  const Icon = getAreaIconComponent(iconName);
  const boxClass = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  const iconClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${boxClass} ${style.badgeBgClass} ${style.badgeTextClass}`}
    >
      <Icon className={iconClass} />
    </span>
  );
}

export function AreaDot({ token }: { token?: string | null }) {
  const style = getLifeAreaStyle(token);
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${style.dotClass}`}
    />
  );
}

export function AreaLabel({
  name,
  token,
}: {
  name: string;
  token?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <AreaDot token={token} />
      <span>{name}</span>
    </span>
  );
}
