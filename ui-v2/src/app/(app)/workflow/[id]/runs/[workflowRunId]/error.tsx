"use client";

import {
  IconAlertTriangle,
  IconArrowLeft,
  IconRefresh,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

export default function WorkflowRunError({ reset }: { reset: () => void }) {
  const pathname = usePathname();
  const workflowPath = pathname.split("/runs/")[0] || "/workflow";

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center p-6">
      <Alert variant="destructive">
        <IconAlertTriangle aria-hidden="true" />
        <AlertTitle>Workflow run page failed to render</AlertTitle>
        <AlertDescription>
          The durable run is still available. Retry this view or return to the
          workflow without changing the execution.
        </AlertDescription>
        <div className="col-start-2 mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={reset}>
            <IconRefresh data-icon="inline-start" />
            Retry view
          </Button>
          <Link
            href={workflowPath}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <IconArrowLeft data-icon="inline-start" />
            Back to workflow
          </Link>
        </div>
      </Alert>
    </main>
  );
}
