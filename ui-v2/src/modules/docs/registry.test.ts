import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { docsEntries, docsSections, searchDocs } from "./registry";

describe("documentation registry", () => {
  test("has unique slugs and headings", () => {
    expect(new Set(docsEntries.map((entry) => entry.slug)).size).toBe(
      docsEntries.length,
    );

    for (const entry of docsEntries) {
      expect(new Set(entry.headings.map((heading) => heading.id)).size).toBe(
        entry.headings.length,
      );
      expect(entry.headings.length).toBeGreaterThan(0);
    }
  });

  test("uses known sections and has content for every route", () => {
    const sectionIds = new Set(docsSections.map((section) => section.id));

    for (const entry of docsEntries) {
      expect(sectionIds.has(entry.section)).toBe(true);
      const contentPath = resolve(
        process.cwd(),
        "src/modules/docs/content",
        `${entry.slug}.mdx`,
      );
      expect(existsSync(contentPath)).toBe(true);
    }
  });

  test("all internal documentation links resolve", () => {
    const knownRoutes = new Set([
      "/docs",
      "/agent-setup",
      ...docsEntries.map((entry) => `/docs/${entry.slug}`),
    ]);

    for (const entry of docsEntries) {
      const contentPath = resolve(
        process.cwd(),
        "src/modules/docs/content",
        `${entry.slug}.mdx`,
      );
      const content = readFileSync(contentPath, "utf8");
      const links = content.matchAll(
        /\]\((\/docs(?:\/[^)#\s]+)?|\/agent-setup)\)/g,
      );
      for (const match of links) {
        expect(knownRoutes.has(match[1])).toBe(true);
      }
    }
  });

  test("searches titles, headings, summaries, and keywords", () => {
    expect(
      searchDocs("Kafka").some((entry) => entry.slug === "reference/services"),
    ).toBe(true);
    expect(
      searchDocs("automation with boundaries").some(
        (entry) => entry.slug === "start/philosophy",
      ),
    ).toBe(true);
    expect(searchDocs("validation receipt").length).toBeGreaterThan(0);
  });
});
