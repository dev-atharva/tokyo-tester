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
