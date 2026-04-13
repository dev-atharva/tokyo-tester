import { cn } from "@/lib/utils";
import { TokyoTesterMark } from "./tokyo-tester-mark";

interface TokyoTesterBrandProps {
  className?: string;
  compact?: boolean;
}

export const TokyoTesterBrand = ({
  className,
  compact = false,
}: TokyoTesterBrandProps) => {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-background shadow-sm">
        <TokyoTesterMark className="h-7 w-7" />
      </div>
      {!compact ? (
        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
          <div className="truncate text-sm font-semibold tracking-normal text-foreground">
            Tokyo Tester
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            Orchestrated test runs
          </div>
        </div>
      ) : null}
    </div>
  );
};
