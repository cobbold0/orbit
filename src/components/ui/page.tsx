import React from "react";
import { getLifeAreaStyle } from "@/lib/design/tokens";

export { Dropdown } from "./dropdown";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="h1">{title}</h1>
      {children}
    </header>
  );
}

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
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title ? <h2 className="h2">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
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

/** Area dot followed by its name. Colour is never the only signal. */
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
