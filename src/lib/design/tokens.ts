export type LifeAreaColorToken =
  | "slate"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "teal"
  | "violet";

export interface LifeAreaVisualStyle {
  token: LifeAreaColorToken;
  label: string;
  dotClass: string;
}

/**
 * Life areas are identified by a small dot next to their name.
 * Colour is never the only signal: the area name always appears beside it.
 */
export const LIFE_AREA_STYLES: Record<LifeAreaColorToken, LifeAreaVisualStyle> =
  {
    slate: { token: "slate", label: "Slate", dotClass: "bg-slate-500" },
    indigo: { token: "indigo", label: "Indigo", dotClass: "bg-indigo-500" },
    emerald: { token: "emerald", label: "Green", dotClass: "bg-emerald-500" },
    amber: { token: "amber", label: "Amber", dotClass: "bg-amber-500" },
    rose: { token: "rose", label: "Rose", dotClass: "bg-rose-500" },
    teal: { token: "teal", label: "Teal", dotClass: "bg-teal-500" },
    violet: { token: "violet", label: "Violet", dotClass: "bg-violet-500" },
  };

export function getLifeAreaStyle(token?: string | null): LifeAreaVisualStyle {
  if (token && token in LIFE_AREA_STYLES) {
    return LIFE_AREA_STYLES[token as LifeAreaColorToken];
  }
  return LIFE_AREA_STYLES.slate;
}
