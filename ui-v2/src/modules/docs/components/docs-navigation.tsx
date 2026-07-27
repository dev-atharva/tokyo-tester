"use client";

import { IconMenu2 } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import styles from "../docs.module.css";
import { docsEntries, docsSections, getDocsForSection } from "../registry";

function NavigationLinks({
  closeOnNavigate = false,
}: {
  closeOnNavigate?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation navigation">
      {docsSections.map((section) => (
        <div className={styles.navSection} key={section.id}>
          <p className={styles.navSectionTitle}>{section.title}</p>
          {getDocsForSection(section.id).map((entry) => {
            const link = (
              <Link
                className={cn(
                  styles.navLink,
                  pathname === `/docs/${entry.slug}` && styles.navLinkActive,
                )}
                href={`/docs/${entry.slug}`}
                key={entry.slug}
              >
                {entry.title}
              </Link>
            );
            return closeOnNavigate ? (
              <SheetClose key={entry.slug} render={link} />
            ) : (
              <span key={entry.slug}>{link}</span>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar() {
  return (
    <aside className={styles.sidebar}>
      <NavigationLinks />
    </aside>
  );
}

export function MobileDocsNavigation() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            className={styles.mobileNav}
            variant="outline"
            size="icon-sm"
            aria-label="Open documentation navigation"
          />
        }
      >
        <IconMenu2 />
      </SheetTrigger>
      <SheetContent side="left" className="w-[19rem] p-0 sm:max-w-[19rem]">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Tokyo Tester docs</SheetTitle>
          <SheetDescription>
            {docsEntries.length} practical guides and references.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-4">
          <NavigationLinks closeOnNavigate />
        </div>
      </SheetContent>
    </Sheet>
  );
}
