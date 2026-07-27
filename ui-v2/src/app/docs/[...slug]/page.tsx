import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDoc } from "@/modules/docs/content";
import styles from "@/modules/docs/docs.module.css";
import {
  docsEntries,
  getDoc,
  getDocNeighbors,
  getSection,
} from "@/modules/docs/registry";

type DocsArticlePageProps = {
  params: Promise<{ slug: string[] }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return docsEntries.map((entry) => ({ slug: entry.slug.split("/") }));
}

export async function generateMetadata({
  params,
}: DocsArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getDoc(slug.join("/"));
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.summary,
  };
}

export default async function DocsArticlePage({
  params,
}: DocsArticlePageProps) {
  const { slug } = await params;
  const joinedSlug = slug.join("/");
  const entry = getDoc(joinedSlug);
  const module = entry ? await loadDoc(joinedSlug) : undefined;

  if (!entry || !module) notFound();

  const section = getSection(entry.section);
  const neighbors = getDocNeighbors(entry.slug);
  const Content = module.default;

  return (
    <div className={styles.articleGrid}>
      <article className={styles.article}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/docs">Docs</Link>
          <span aria-hidden="true">/</span>
          <span>{section.title}</span>
        </nav>
        <header>
          <p className={styles.articleEyebrow}>{section.title}</p>
          <h1 className={styles.articleTitle}>{entry.title}</h1>
          <p className={styles.articleSummary}>{entry.summary}</p>
          <div className={styles.articleRule} />
        </header>
        <Content />
        <nav
          className={styles.articleFooter}
          aria-label="Adjacent documentation"
        >
          {neighbors.previous ? (
            <Link
              className={styles.neighborLink}
              href={`/docs/${neighbors.previous.slug}`}
            >
              <span>Previous</span>
              <strong>{neighbors.previous.title}</strong>
            </Link>
          ) : null}
          {neighbors.next ? (
            <Link
              className={`${styles.neighborLink} ${styles.neighborNext}`}
              href={`/docs/${neighbors.next.slug}`}
            >
              <span>Next</span>
              <strong>{neighbors.next.title}</strong>
            </Link>
          ) : null}
        </nav>
      </article>
      <aside className={styles.toc} aria-label="On this page">
        <p className={styles.tocTitle}>On this page</p>
        {entry.headings.map((heading) => (
          <a href={`#${heading.id}`} key={heading.id}>
            {heading.title}
          </a>
        ))}
      </aside>
    </div>
  );
}
