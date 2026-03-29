"use client";
import { useCallback, useEffect, useRef } from "react";

export type KeyboardShortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description?: string;
};

export type ShortcutHandler = () => void;

export type ShortcutConfig = {
  [shortcutId: string]: {
    shortcut: KeyboardShortcut;
    handler: ShortcutHandler;
  };
};

/**
 * Hook to handle keyboard shortcuts
 * @param shortcuts - Object mapping shortcut IDs to their config
 * @param enabled - Whether shortcuts are enabled (default: true)
 * @returns Object with registered shortcuts info
 *
 * @example
 * useKeyboardShortcuts({
 *   openLogs: {
 *     shortcut: { key: 'l', ctrl: true },
 *     handler: () => setLogsOpen(true)
 *   },
 *   run: {
 *     shortcut: { key: 'Enter', ctrl: true },
 *     handler: handleExecute
 *   }
 * });
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig,
  enabled: boolean = true,
) {
  const handlersRef = useRef<ShortcutConfig>(shortcuts);

  useEffect(() => {
    handlersRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) {
        return;
      }

      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const [_id, config] of Object.entries(handlersRef.current)) {
        const { shortcut, handler } = config;
        const {
          key,
          ctrl = false,
          shift = false,
          alt = false,
          meta = false,
        } = shortcut;
        const eventKey = event.key.toLowerCase();
        const shortcutKey = key.toLowerCase();
        const isKeyMatch = eventKey === shortcutKey;
        const isCtrlMatch = ctrl === (event.ctrlKey || event.metaKey);
        const isShiftMatch = shift === event.shiftKey;
        const isAltMatch = alt === event.altKey;
        const isMetaMatch = meta === event.metaKey;

        if (
          isKeyMatch &&
          isCtrlMatch &&
          isShiftMatch &&
          isAltMatch &&
          isMetaMatch
        ) {
          event.preventDefault();
          handler();
          break;
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);

  return {
    shortcuts: Object.entries(shortcuts).map(([id, config]) => ({
      id,
      ...config,
    })),
  };
}

/**
 * Helper function to format a keyboard shortcut for display
 * @param shortcut - Keyboard shortcut configuration
 * @returns Formatted string (e.g., "Ctrl+Shift+L")
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  // Detect if user is on Mac
  const isMac =
    typeof window !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);

  if (shortcut.ctrl) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
  if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt");
  if (shortcut.meta) parts.push("⌘");

  // Capitalize the key for display
  const keyDisplay =
    shortcut.key.length === 1
      ? shortcut.key.toUpperCase()
      : shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);

  parts.push(keyDisplay);

  return parts.join(isMac ? "" : "+");
}

export function getShortcutDescription(id: string): string {
  const descriptions: Record<string, string> = {
    openLogs: "Open execution logs",
    openAddNode: "Add new node",
    runWorkflow: "Run workflow",
    toggleShortcuts: "Show keyboard shortcuts",
    closeDialogs: "Close dialogs/drawers",
  };
  return descriptions[id] || id;
}

/**
 * Component to display keyboard shortcut hints
 */
export function KeyboardShortcutHint({
  shortcut,
  description,
}: {
  shortcut: KeyboardShortcut;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{description}</span>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
        {formatShortcut(shortcut)}
      </kbd>
    </div>
  );
}
