import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

interface TokyoTesterMarkProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

export const TokyoTesterMark = ({
  className,
  title = "Tokyo Tester",
  ...props
}: TokyoTesterMarkProps) => {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
      {...props}
    >
      <defs>
        <linearGradient id="tokyo-tester-sun" x1="20" y1="12" x2="44" y2="36">
          <stop offset="0" stopColor="#F6D37A" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="tokyo-tester-frame" x1="12" y1="18" x2="54" y2="54">
          <stop offset="0" stopColor="#6B3410" />
          <stop offset="1" stopColor="#2C1608" />
        </linearGradient>
      </defs>

      <rect x="7" y="8" width="50" height="50" rx="14" fill="#F8F4EB" />
      <circle cx="42" cy="22" r="10" fill="url(#tokyo-tester-sun)" />

      <path
        d="M15 22H49"
        stroke="url(#tokyo-tester-frame)"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M20 30H44"
        stroke="url(#tokyo-tester-frame)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M24 22L22 48"
        stroke="url(#tokyo-tester-frame)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M40 22L42 48"
        stroke="url(#tokyo-tester-frame)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      <path
        d="M17 49C23 43.5 29 41.5 36 41.5H44.5"
        stroke="#C26A1B"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="17" cy="49" r="3.5" fill="#C26A1B" />
      <circle cx="31" cy="42" r="2.75" fill="#E7A93B" />
      <circle cx="44.5" cy="41.5" r="3.5" fill="#6B3410" />
    </svg>
  );
};
