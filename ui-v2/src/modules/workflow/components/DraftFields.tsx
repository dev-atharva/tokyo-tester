"use client";

import {
  type ComponentProps,
  type FocusEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type JsonDraftResult<T> =
  | { status: "valid"; value: T | undefined }
  | { status: "invalid" };

export function resolveJsonDraft<T>(
  draft: string,
  parse: (value: string) => T | undefined,
): JsonDraftResult<T> {
  if (!draft.trim()) {
    return { status: "valid", value: undefined };
  }

  try {
    const value = parse(draft);
    return value === undefined
      ? { status: "invalid" }
      : { status: "valid", value };
  } catch {
    return { status: "invalid" };
  }
}

export function resolveNumberDraft(
  draft: string,
): { status: "valid"; value: number } | { status: "incomplete" } {
  if (!draft.trim() || ["-", "+", ".", "-.", "+."].includes(draft.trim())) {
    return { status: "incomplete" };
  }

  const value = Number(draft);
  return Number.isFinite(value)
    ? { status: "valid", value }
    : { status: "incomplete" };
}

function formatJson(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

interface DraftJsonTextareaProps<T>
  extends Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> {
  value: T | undefined;
  parse: (value: string) => T | undefined;
  onValueChange: (value: T | undefined) => void;
  invalidMessage?: string;
}

export function DraftJsonTextarea<T>({
  value,
  parse,
  onValueChange,
  invalidMessage = "Enter valid JSON to save this field.",
  id,
  onBlur,
  onFocus,
  ...props
}: DraftJsonTextareaProps<T>) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const serializedValue = useMemo(() => formatJson(value), [value]);
  const [draft, setDraft] = useState(serializedValue);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(serializedValue);
      setInvalid(false);
    }
  }, [serializedValue]);

  const handleBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    focused.current = false;
    const result = resolveJsonDraft(draft, parse);
    if (result.status === "valid") {
      setDraft(formatJson(result.value));
      setInvalid(false);
    }
    onBlur?.(event);
  };

  return (
    <div className="space-y-1.5">
      <Textarea
        {...props}
        id={fieldId}
        value={draft}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : props["aria-describedby"]}
        onFocus={(event) => {
          focused.current = true;
          onFocus?.(event);
        }}
        onBlur={handleBlur}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const result = resolveJsonDraft(nextDraft, parse);
          const nextInvalid = result.status === "invalid";
          setInvalid(nextInvalid);
          if (!nextInvalid) onValueChange(result.value);
        }}
      />
      {invalid ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}

interface DraftNumberInputProps
  extends Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: number;
  onValueChange: (value: number) => void;
}

export function DraftNumberInput({
  value,
  onValueChange,
  onBlur,
  onFocus,
  ...props
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  return (
    <Input
      {...props}
      type="number"
      value={draft}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focused.current = false;
        const result = resolveNumberDraft(draft);
        setDraft(
          result.status === "valid" ? String(result.value) : String(value),
        );
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const result = resolveNumberDraft(nextDraft);
        if (result.status === "valid") onValueChange(result.value);
      }}
    />
  );
}
