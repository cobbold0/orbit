export type LifeAreaColorToken =
  | "slate"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "teal"
  | "violet";

export type LifeAreaIconName =
  | "Building2"
  | "Briefcase"
  | "Code2"
  | "FolderKanban"
  | "GraduationCap"
  | "Music"
  | "Heart"
  | "Dumbbell"
  | "Home"
  | "Wallet"
  | "Globe"
  | "Compass"
  | "CircleDot";

export interface LifeAreaVisualStyle {
  token: LifeAreaColorToken;
  label: string;
  dotClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
}

/**
 * Life areas are identified by a clean icon/dot badge next to their name.
 * Colour is never the only signal: the area name always appears beside it.
 */
export const LIFE_AREA_STYLES: Record<LifeAreaColorToken, LifeAreaVisualStyle> =
  {
    slate: {
      token: "slate",
      label: "Slate",
      dotClass: "bg-slate-500",
      badgeBgClass: "bg-slate-200/80",
      badgeTextClass: "text-slate-700",
    },
    indigo: {
      token: "indigo",
      label: "Indigo",
      dotClass: "bg-indigo-500",
      badgeBgClass: "bg-indigo-100",
      badgeTextClass: "text-indigo-700",
    },
    emerald: {
      token: "emerald",
      label: "Green",
      dotClass: "bg-emerald-500",
      badgeBgClass: "bg-emerald-100",
      badgeTextClass: "text-emerald-700",
    },
    amber: {
      token: "amber",
      label: "Amber",
      dotClass: "bg-amber-500",
      badgeBgClass: "bg-amber-100",
      badgeTextClass: "text-amber-800",
    },
    rose: {
      token: "rose",
      label: "Rose",
      dotClass: "bg-rose-500",
      badgeBgClass: "bg-rose-100",
      badgeTextClass: "text-rose-700",
    },
    teal: {
      token: "teal",
      label: "Teal",
      dotClass: "bg-teal-500",
      badgeBgClass: "bg-teal-100",
      badgeTextClass: "text-teal-700",
    },
    violet: {
      token: "violet",
      label: "Violet",
      dotClass: "bg-violet-500",
      badgeBgClass: "bg-violet-100",
      badgeTextClass: "text-violet-700",
    },
  };

export const LIFE_AREA_ICON_OPTIONS: {
  name: LifeAreaIconName;
  label: string;
}[] = [
  { name: "Building2", label: "Office" },
  { name: "Briefcase", label: "Work" },
  { name: "Code2", label: "Tech" },
  { name: "FolderKanban", label: "Projects" },
  { name: "GraduationCap", label: "Study" },
  { name: "Music", label: "Music" },
  { name: "Compass", label: "Life" },
  { name: "Heart", label: "Wellbeing" },
  { name: "Dumbbell", label: "Fitness" },
  { name: "Home", label: "Home" },
  { name: "Wallet", label: "Finance" },
  { name: "Globe", label: "World" },
  { name: "CircleDot", label: "General" },
];

export function getLifeAreaStyle(token?: string | null): LifeAreaVisualStyle {
  if (token && token in LIFE_AREA_STYLES) {
    return LIFE_AREA_STYLES[token as LifeAreaColorToken];
  }
  return LIFE_AREA_STYLES.slate;
}
