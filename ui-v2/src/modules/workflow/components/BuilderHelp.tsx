"use client";

import {
  IconBook2,
  IconExternalLink,
  IconHelpCircle,
  IconInfoCircle,
  IconListCheck,
} from "@tabler/icons-react";
import { cloneElement } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GUIDED_DOCUMENTATION } from "../lib/builder-experience";

export function ContextHelp({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Open contextual help"
            data-help-topic={label}
          />
        }
      >
        <IconInfoCircle />
      </TooltipTrigger>
      <TooltipContent className="max-w-72" side="bottom" align="start">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function DocumentationLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "link", size: "xs" })}
    >
      {children}
      <IconExternalLink data-icon="inline-end" />
    </a>
  );
}

export function DisabledActionHelp({
  reason,
  children,
}: {
  reason?: string;
  children: React.ReactElement<{
    "aria-disabled"?: boolean;
    className?: string;
    disabled?: boolean;
    onClick?: React.MouseEventHandler;
  }>;
}) {
  if (!reason) return children;

  const focusableAction = cloneElement(children, {
    "aria-disabled": true,
    className: cn(children.props.className, "cursor-not-allowed opacity-50"),
    disabled: false,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={focusableAction}
        aria-label={`Run unavailable: ${reason}`}
      />
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function BuilderHelpMenu({
  onShowChecklist,
}: {
  onShowChecklist: () => void;
}) {
  const docs = [
    GUIDED_DOCUMENTATION.gettingStarted,
    GUIDED_DOCUMENTATION.services,
    GUIDED_DOCUMENTATION.scenarios,
    GUIDED_DOCUMENTATION.review,
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <IconHelpCircle data-icon="inline-start" />
        Help
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Guided setup</DropdownMenuLabel>
          <DropdownMenuItem onClick={onShowChecklist}>
            <IconListCheck />
            Show setup checklist
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Recommended documentation</DropdownMenuLabel>
          {docs.map((doc) => (
            <DropdownMenuItem
              key={doc.href}
              render={
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={doc.label}
                >
                  <span className="sr-only">{doc.label}</span>
                </a>
              }
            >
              <IconBook2 />
              <span className="min-w-0 flex-1 truncate">{doc.label}</span>
              <IconExternalLink />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
