import {
  IconArrowRight,
  IconBook2,
  IconBrandGithub,
  IconLayersIntersect,
  IconRoute,
  IconTrash,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TokyoTesterBrand } from "@/components/branding/tokyo-tester-brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LandingExecutionVisual } from "@/modules/marketing/components/landing-execution-visual";
import styles from "@/modules/marketing/landing.module.css";

const repositoryUrl = "https://github.com/dev-atharva/tokyo-tester";
const docsUrl = "/docs";

export const metadata: Metadata = {
  title: "Tokyo Tester — Test entire service environments",
  description:
    "Build isolated service environments and run repeatable end-to-end scenarios without depending on shared staging infrastructure.",
};

const workflow = [
  {
    label: "Define the system",
    description: "Connect services and real dependencies.",
    icon: IconLayersIntersect,
  },
  {
    label: "Run the scenario",
    description: "Exercise the journey from end to end.",
    icon: IconRoute,
  },
  {
    label: "Clean it up",
    description: "Keep the results, discard the environment.",
    icon: IconTrash,
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main navigation">
          <Link href="/" aria-label="Tokyo Tester home">
            <TokyoTesterBrand />
          </Link>

          <div className="flex items-center gap-1.5">
            <Link
              href={docsUrl}
              className={buttonVariants({ variant: "ghost", size: "lg" })}
            >
              <IconBook2 data-icon="inline-start" />
              Docs
            </Link>
            <Link
              href="/login?redirectTo=/workflow"
              className={buttonVariants({ variant: "default", size: "lg" })}
            >
              Sign in
              <IconArrowRight data-icon="inline-end" />
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowPulse} aria-hidden="true" />
              Environments that prove themselves
            </div>

            <h1 className={styles.title}>
              Test entire service environments.
              <span>Not just individual APIs.</span>
            </h1>

            <p className={styles.subtitle}>
              Build isolated environments, describe real-world scenarios, and
              run repeatable end-to-end tests—without fighting shared staging
              infrastructure.
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/login?redirectTo=/workflow"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "h-11 px-4",
                )}
              >
                Sign in to Tokyo Tester
                <IconArrowRight data-icon="inline-end" />
              </Link>
              <Link
                href={docsUrl}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 px-4",
                )}
              >
                Read the docs
              </Link>
            </div>

            <ul className={styles.capabilities} aria-label="Core capabilities">
              <li>Real dependencies</li>
              <li>Isolated runs</li>
              <li>Automatic cleanup</li>
            </ul>
          </div>

          <div className={styles.visualWrap}>
            <LandingExecutionVisual />
          </div>
        </section>

        <section
          className={styles.workflow}
          aria-label="How Tokyo Tester works"
        >
          <ol className={styles.workflowList}>
            {workflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.label} className={styles.workflowStep}>
                  <div className={styles.stepNumber}>0{index + 1}</div>
                  <Icon className={styles.stepIcon} aria-hidden="true" />
                  <div>
                    <h2>{step.label}</h2>
                    <p>{step.description}</p>
                  </div>
                  {index < workflow.length - 1 ? (
                    <IconArrowRight
                      className={styles.stepArrow}
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>Open source. Self-hosted. Built for real dependencies.</p>
        <Link href={repositoryUrl}>
          <IconBrandGithub aria-hidden="true" />
          View on GitHub
        </Link>
      </footer>
    </div>
  );
}
