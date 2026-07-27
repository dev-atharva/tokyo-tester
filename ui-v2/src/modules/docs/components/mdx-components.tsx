import {
  IconAlertTriangle,
  IconBulb,
  IconInfoCircle,
  IconLock,
} from "@tabler/icons-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import styles from "../docs.module.css";
import { CodeBlock } from "./code-block";

export const mdxComponents = {
  h2: ({ className, ...props }: ComponentProps<"h2">) => (
    <h2 className={cn(styles.articleH2, className)} {...props} />
  ),
  h3: ({ className, ...props }: ComponentProps<"h3">) => (
    <h3 className={cn(styles.articleH3, className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentProps<"p">) => (
    <p className={cn(styles.articleParagraph, className)} {...props} />
  ),
  ul: ({ className, ...props }: ComponentProps<"ul">) => (
    <ul className={cn(styles.articleList, className)} {...props} />
  ),
  ol: ({ className, ...props }: ComponentProps<"ol">) => (
    <ol className={cn(styles.articleOrderedList, className)} {...props} />
  ),
  blockquote: ({ className, ...props }: ComponentProps<"blockquote">) => (
    <blockquote className={cn(styles.articleQuote, className)} {...props} />
  ),
  a: ({ href = "", className, ...props }: ComponentProps<"a">) => {
    const linkClass = cn(styles.articleLink, className);
    return href.startsWith("/") || href.startsWith("#") ? (
      <Link className={linkClass} href={href} {...props} />
    ) : (
      <a
        className={linkClass}
        href={href}
        rel="noreferrer"
        target="_blank"
        {...props}
      />
    );
  },
  code: ({ className, ...props }: ComponentProps<"code">) => (
    <code className={cn(styles.inlineCode, className)} {...props} />
  ),
  pre: CodeBlock,
  table: ({ children }: ComponentProps<"table">) => (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  ),
  Callout,
  LifecycleDiagram,
  ProvisioningDiagram,
  TestExecutionDiagram,
  SystemDiagram,
};

type CalloutKind = "note" | "idea" | "warning" | "security";

const calloutIcons = {
  note: IconInfoCircle,
  idea: IconBulb,
  warning: IconAlertTriangle,
  security: IconLock,
};

export function Callout({
  title,
  kind = "note",
  children,
}: {
  title: string;
  kind?: CalloutKind;
  children: ReactNode;
}) {
  const Icon = calloutIcons[kind];
  return (
    <Alert className={styles.callout} data-kind={kind}>
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function LifecycleDiagram() {
  const stages = [
    "Graph",
    "Bundle",
    "Network",
    "Services",
    "Tests",
    "Results",
    "Cleanup",
  ];
  return (
    <figure
      className={styles.lifecycle}
      aria-label="Tokyo Tester execution lifecycle"
    >
      {stages.map((stage, index) => (
        <div className={styles.lifecycleStage} key={stage}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{stage}</strong>
        </div>
      ))}
      <figcaption>
        Every run turns a saved definition into a disposable environment and
        durable evidence.
      </figcaption>
    </figure>
  );
}

export function SystemDiagram() {
  return (
    <figure
      className={styles.systemDiagram}
      aria-label="Tokyo Tester component flow"
    >
      <div>
        <span>Authoring plane</span>
        <strong>Next.js UI</strong>
        <small>Zustand · sync queue</small>
      </div>
      <b aria-hidden="true">→</b>
      <div>
        <span>Durable control</span>
        <strong>MySQL worker</strong>
        <small>Runs · checkpoints · leases</small>
      </div>
      <b aria-hidden="true">→</b>
      <div>
        <span>Execution plane</span>
        <strong>Go runner</strong>
        <small>Docker · tests · cleanup</small>
      </div>
      <figcaption>
        SSE accelerates updates; persisted snapshots remain the source of truth.
      </figcaption>
    </figure>
  );
}

export function ProvisioningDiagram() {
  const levels = [
    {
      label: "Level 01",
      note: "No unmet dependencies",
      services: ["PostgreSQL", "Kafka"],
    },
    {
      label: "Level 02",
      note: "Infrastructure is ready",
      services: ["Payment API", "Fraud service"],
    },
    {
      label: "Level 03",
      note: "Application APIs are ready",
      services: ["Frontend"],
    },
  ];

  return (
    <figure
      className={styles.provisioningDiagram}
      aria-label="Dependency-aware service provisioning"
    >
      <div className={styles.diagramKicker}>
        <span>Orchestrator plan</span>
        <strong>One network · readiness-gated levels</strong>
      </div>
      <div className={styles.provisioningPrelude}>
        <span>Prepare authenticated images</span>
        <b aria-hidden="true">→</b>
        <span>Create labeled Docker network</span>
        <b aria-hidden="true">→</b>
        <span>Resolve dependency graph</span>
      </div>
      <div className={styles.networkFrame}>
        <div className={styles.networkLabel}>Isolated execution network</div>
        <div className={styles.provisioningLevels}>
          {levels.map((level, index) => (
            <section className={styles.provisioningLevel} key={level.label}>
              <div>
                <span>{level.label}</span>
                <small>{level.note}</small>
              </div>
              <ul>
                {level.services.map((service) => (
                  <li key={service}>{service}</li>
                ))}
              </ul>
              {index < levels.length - 1 ? <b aria-hidden="true">↓</b> : null}
            </section>
          ))}
        </div>
      </div>
      <div className={styles.diagramOutcome}>
        <span>Runtime registry</span>
        <strong>Aliases · container IDs · mapped ports</strong>
        <small>Available to executors and cleanup</small>
      </div>
      <figcaption>
        Services in one level may start together. The next level begins only
        after the providers for the previous level report readiness.
      </figcaption>
    </figure>
  );
}

export function TestExecutionDiagram() {
  const steps = [
    ["01", "Interpolate", "Resolve runtime service values"],
    ["02", "Select executor", "HTTP · DB · cache · queue · shell"],
    ["03", "Execute", "Perform the operation and assertion"],
    ["04", "Checkpoint", "Persist result and advance the cursor"],
  ];

  return (
    <figure
      className={styles.testExecutionDiagram}
      aria-label="Ordered scenario test execution"
    >
      <div className={styles.diagramKicker}>
        <span>Scenario loop</span>
        <strong>Ordered steps · durable evidence</strong>
      </div>
      <div className={styles.testExecutionSteps}>
        {steps.map(([number, title, note]) => (
          <div className={styles.testExecutionStep} key={number}>
            <span>{number}</span>
            <strong>{title}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className={styles.testBranches}>
        <div data-result="pass">
          <span>Pass</span>
          <strong>Store evidence</strong>
          <small>Continue to the next declared step</small>
        </div>
        <div data-result="fail">
          <span>Fail</span>
          <strong>Capture error + service logs</strong>
          <small>Persist the failure before continuing</small>
        </div>
      </div>
      <div className={styles.testCleanupRail}>
        <span>After the scenario</span>
        <b aria-hidden="true">→</b>
        <strong>Terminate containers</strong>
        <b aria-hidden="true">→</b>
        <strong>Remove network</strong>
        <b aria-hidden="true">→</b>
        <strong>Finalize status</strong>
      </div>
      <figcaption>
        A browser disconnect does not own this loop. Checkpoints let the durable
        worker and UI reason about completed work independently.
      </figcaption>
    </figure>
  );
}
