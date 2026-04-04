"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  label: string;
  pendingLabel: string;
  className?: string;
}

export function SubmitButton({
  label,
  pendingLabel,
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className={className || "w-full"}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
