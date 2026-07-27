"use client";

import { IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import styles from "../docs.module.css";
import { getSection, searchDocs } from "../registry";

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    return searchDocs(query);
  }, [query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Search documentation"
          />
        }
      >
        <IconSearch data-icon="inline-start" />
        <span className="hidden sm:inline">Search docs</span>
        <kbd className="hidden border-l pl-2 font-mono text-[10px] text-muted-foreground md:inline">
          ⌘ K
        </kbd>
      </DialogTrigger>
      <DialogContent className={styles.searchDialog}>
        <DialogHeader className={styles.searchHeader}>
          <DialogTitle>Search Tokyo Tester</DialogTitle>
          <DialogDescription>
            Find concepts, guides, architecture, and exact capability
            references.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.searchInputWrap}>
          <IconSearch aria-hidden="true" />
          <Input
            autoFocus
            className={styles.searchInput}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try ‘Kafka’, ‘cleanup’, or ‘agent token’"
            value={query}
          />
        </div>
        <div className={styles.searchResults} aria-live="polite">
          {results.length ? (
            results.map((entry) => (
              <Link
                className={styles.searchResult}
                href={`/docs/${entry.slug}`}
                key={entry.slug}
                onClick={() => setOpen(false)}
              >
                <strong>{entry.title}</strong>
                <span>
                  {getSection(entry.section).title} · {entry.summary}
                </span>
              </Link>
            ))
          ) : (
            <p className={styles.searchEmpty}>No matching documentation yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
