import type { ReactNode } from "react";

export function AdminShell({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(180,138,70,0.16),transparent_24%),linear-gradient(180deg,rgba(251,248,242,0.96),rgba(244,238,230,0.9))] dark:bg-[radial-gradient(circle_at_top_left,rgba(204,162,96,0.14),transparent_28%),linear-gradient(180deg,rgba(27,23,19,0.98),rgba(19,16,13,0.98))]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <header className="relative overflow-hidden rounded-2xl border border-amber-800/15 dark:border-amber-200/10 bg-white/85 dark:bg-stone-950/75 px-6 py-6 shadow-sm backdrop-blur-sm">
          {/* Subtle corner accent — radial only, no harsh linear sweep */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/10 dark:bg-amber-300/8 blur-3xl" />

          <p className="relative text-[10px] font-semibold uppercase tracking-[0.36em] text-amber-700/80 dark:text-amber-300/60">
            {eyebrow}
          </p>
          <h1 className="relative mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="relative mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </header>

        {children}
      </div>
    </section>
  );
}