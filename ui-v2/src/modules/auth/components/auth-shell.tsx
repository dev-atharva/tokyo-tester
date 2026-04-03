import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 animate-[auth-fade-in_0.4s_ease_both] [background:radial-gradient(circle_at_18%_14%,rgba(177,139,84,0.13)_0%,transparent_38%),linear-gradient(170deg,rgba(255,250,240,0.95)_0%,rgba(244,240,232,0.98)_100%)] dark:[background:radial-gradient(circle_at_18%_14%,rgba(232,196,134,0.14)_0%,transparent_32%),linear-gradient(170deg,rgba(30,24,18,0.97)_0%,rgba(20,17,14,0.99)_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-130 w-130 rounded-full animate-[auth-orb-drift_12s_ease-in-out_infinite] [background:radial-gradient(circle,rgba(177,139,84,0.10)_0%,transparent_70%)] dark:[background:radial-gradient(circle,rgba(232,196,134,0.09)_0%,transparent_70%)]"
      />

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center gap-5 border border-[rgba(177,139,84,0.18)] bg-[rgba(255,252,245,0.72)] p-8 backdrop-blur-md animate-[auth-fade-up_0.55s_ease_both] dark:border-[rgba(232,196,134,0.14)] dark:bg-[rgba(28,22,16,0.65)]">
            <div className="animate-[auth-fade-up_0.55s_0.05s_ease_both]">
              <span className="inline-block border-l-2 border-l-[rgba(177,139,84,0.55)] py-0.75 pl-2 pr-2.5 text-[10px] font-semibold uppercase tracking-[0.38em] text-[rgba(177,139,84,0.9)] dark:border-l-[rgba(232,196,134,0.4)] dark:text-[rgba(232,196,134,0.85)]">
                Tokyo Tester
              </span>
            </div>

            <h1 className="max-w-xl text-[clamp(1.6rem,3vw,2.15rem)] font-semibold leading-tight tracking-[-0.025em] text-foreground animate-[auth-fade-up_0.55s_0.1s_ease_both]">
              Build and validate complex test workflows in one place.
            </h1>

            <p className="max-w-lg text-sm leading-[1.7] text-muted-foreground animate-[auth-fade-up_0.55s_0.15s_ease_both]">
              Model services, provision dependencies, run scenarios, and inspect
              results without piecing together manual test environments.
            </p>

            <div
              aria-hidden="true"
              className="h-[1.5px] w-10 animate-[auth-fade-up_0.55s_0.2s_ease_both] [background:linear-gradient(90deg,rgba(177,139,84,0.6),transparent)] dark:[background:linear-gradient(90deg,rgba(232,196,134,0.5),transparent)]"
            />

            <div className="flex flex-wrap gap-2">
              {[
                "Service Graphs",
                "Infra Dependencies",
                "Scenario Execution",
              ].map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-full border border-[rgba(177,139,84,0.25)] bg-[rgba(177,139,84,0.07)] px-2.5 py-0.75 text-[11px] font-medium tracking-[0.03em] text-[rgba(140,105,55,0.9)] transition-[background,border-color] duration-200 animate-[auth-fade-up_0.55s_0.22s_ease_both] hover:border-[rgba(177,139,84,0.4)] hover:bg-[rgba(177,139,84,0.13)] dark:border-[rgba(232,196,134,0.2)] dark:bg-[rgba(232,196,134,0.06)] dark:text-[rgba(210,175,110,0.85)] dark:hover:border-[rgba(232,196,134,0.35)] dark:hover:bg-[rgba(232,196,134,0.12)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <Card className="border-[rgba(177,139,84,0.18)] bg-[rgba(255,253,248,0.94)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_32px_rgba(177,139,84,0.06),0_0_0_1px_rgba(255,255,255,0.6)_inset] backdrop-blur-md animate-[auth-fade-up_0.55s_0.08s_ease_both] transition-shadow duration-300 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05),0_12px_40px_rgba(177,139,84,0.09),0_0_0_1px_rgba(255,255,255,0.6)_inset] dark:border-[rgba(232,196,134,0.13)] dark:bg-[rgba(26,20,14,0.92)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_32px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.03)_inset] dark:hover:shadow-[0_1px_3px_rgba(0,0,0,0.35),0_12px_40px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
            <CardHeader className="space-y-1.5 border-b border-b-[rgba(177,139,84,0.12)] pb-3 dark:border-b-[rgba(232,196,134,0.1)]">
              <CardTitle className="text-[1.15rem] font-semibold tracking-[-0.015em] text-foreground">
                {title}
              </CardTitle>
              <CardDescription className="text-[0.8125rem] leading-[1.55] text-muted-foreground">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">{children}</CardContent>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes auth-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes auth-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes auth-orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(30px, -20px) scale(1.06); }
        }
      `}</style>
    </div>
  );
}
