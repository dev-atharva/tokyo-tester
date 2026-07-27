import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function DocsNotFound() {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Documentation · 404
      </p>
      <h1 className="max-w-lg text-4xl font-semibold tracking-tight">
        That page is outside the known environment.
      </h1>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        The guide may have moved, or the URL may describe a capability Tokyo
        Tester does not support yet.
      </p>
      <Link className={buttonVariants()} href="/docs">
        Return to the field manual
      </Link>
    </div>
  );
}
