"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  const { htmlFor, ...rest } = props;

  if (!htmlFor) {
    return (
      <span
        data-slot="label"
        className={cn(
          "gap-2 text-xs leading-none group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
          className,
        )}
        {...rest}
      />
    );
  }

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: this primitive is reused both as a real label and as inline text.
    <label
      data-slot="label"
      className={cn(
        "gap-2 text-xs leading-none group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
        className,
      )}
      htmlFor={htmlFor}
      {...rest}
    />
  );
}

export { Label };
