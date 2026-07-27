import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TokyoTesterBrand } from "@/components/branding/tokyo-tester-brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "../docs.module.css";
import { DocsSidebar, MobileDocsNavigation } from "./docs-navigation";
import { DocsSearch } from "./docs-search";

const repositoryUrl = "https://github.com/dev-atharva/tokyo-tester";

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.docsPage}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <MobileDocsNavigation />
          <Link className={styles.brandLockup} href="/">
            <TokyoTesterBrand />
            <span className={styles.brandDivider} aria-hidden="true" />
            <span className={styles.brandLabel}>Field manual</span>
          </Link>
          <div className={styles.headerActions}>
            <DocsSearch />
            <Link
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              <IconBrandGithub data-icon="inline-start" />
              GitHub
            </Link>
            <Link
              className={cn(
                buttonVariants({ size: "sm" }),
                "hidden sm:inline-flex",
              )}
              href="/login?redirectTo=/workflow"
            >
              Open app
              <IconArrowRight data-icon="inline-end" />
            </Link>
          </div>
        </div>
      </header>
      <div className={styles.shell}>
        <DocsSidebar />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
