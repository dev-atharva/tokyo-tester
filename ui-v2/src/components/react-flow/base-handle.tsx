import type { ComponentProps } from "react";
import { Handle, type HandleProps } from "reactflow";

import { cn } from "@/lib/utils";

export type BaseHandleProps = HandleProps;

export function BaseHandle({
  className,
  children,
  ...props
}: ComponentProps<typeof Handle>) {
  return (
    <Handle
      {...props}
      className={cn(
        "h-3 w-3 rounded-full border-2 border-primary/60 bg-background shadow-md hover:scale-125 hover:border-primary transition-all duration-200",
        props.type === "source" &&
          "bg-blue-500 border-blue-600 hover:border-blue-700",
        props.type === "target" &&
          "bg-emerald-500 border-emerald-600 hover:border-emerald-700",
        className,
      )}
    >
      {children}
    </Handle>
  );
}
