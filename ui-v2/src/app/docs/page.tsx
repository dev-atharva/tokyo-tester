import {
  IconArrowUpRight,
  IconBinaryTree,
  IconRobot,
  IconRocket,
  IconRoute,
} from "@tabler/icons-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "@/modules/docs/docs.module.css";
import { docsSections, getDocsForSection } from "@/modules/docs/registry";

const paths = [
  {
    title: "Understand the product",
    audience: "For everyone",
    description:
      "See why shared staging fails and how disposable service environments change the debugging conversation.",
    href: "/docs/start/what-is-tokyo-tester",
    icon: IconRoute,
  },
  {
    title: "Build a workflow",
    audience: "Developers · QA · Product",
    description:
      "Turn a service graph and a real user journey into repeatable, ordered checks.",
    href: "/docs/start/first-workflow",
    icon: IconBinaryTree,
  },
  {
    title: "Operate Tokyo Tester",
    audience: "Platform · DevOps",
    description:
      "Run locally, deploy the supported production topology, and protect durable state.",
    href: "/docs/operations/local-development",
    icon: IconRocket,
  },
  {
    title: "Connect a coding agent",
    audience: "Agent users · Security",
    description:
      "Give an agent a narrow, auditable path to validate and run workflows without uploading source code.",
    href: "/docs/agents/overview",
    icon: IconRobot,
  },
];

export default function DocsHomePage() {
  return (
    <div className={styles.home}>
      <section className={styles.homeHero}>
        <p className={styles.homeKicker}>Tokyo Tester documentation</p>
        <h1 className={styles.homeTitle}>
          Build confidence in <em>the whole system.</em>
        </h1>
        <p className={styles.homeIntro}>
          A field manual for describing service environments, exercising real
          journeys, and collecting evidence without depending on a shared
          staging server.
        </p>
      </section>

      <section aria-labelledby="choose-path">
        <h2 className={styles.sectionHeading} id="choose-path">
          Choose where you want to go
        </h2>
        <div className={styles.pathGrid}>
          {paths.map((path, index) => {
            const Icon = path.icon;
            return (
              <Link href={path.href} key={path.href}>
                <Card className={styles.pathCard}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className={styles.pathNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Icon
                        className="size-5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <CardTitle className="text-lg">{path.title}</CardTitle>
                    <p className={styles.pathAudience}>{path.audience}</p>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-5">
                    <p className="max-w-md text-sm leading-6 text-muted-foreground">
                      {path.description}
                    </p>
                    <IconArrowUpRight className="size-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.allSections} aria-labelledby="all-docs">
        <h2 className={styles.sectionHeading} id="all-docs">
          The complete field manual
        </h2>
        <div className={styles.sectionGrid}>
          {docsSections.map((section) => (
            <section className={styles.sectionCard} key={section.id}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
              {getDocsForSection(section.id).map((entry) => (
                <Link href={`/docs/${entry.slug}`} key={entry.slug}>
                  {entry.title} →
                </Link>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
