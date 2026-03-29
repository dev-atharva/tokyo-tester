"use client";
import { IconKeyboard } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatShortcut,
  type KeyboardShortcut,
} from "../hooks/useKeyboardShortcuts";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Array<{
    id: string;
    shortcut: KeyboardShortcut;
    description: string;
  }>;
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconKeyboard className="size-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate faster
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shortcuts.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-lg border bg-muted/50 px-4 py-3"
            >
              <span className="text-sm text-foreground">
                {item.description}
              </span>
              <kbd className="inline-flex h-7 select-none items-center gap-1 rounded border bg-background px-2 font-mono text-xs font-medium text-muted-foreground shadow-sm">
                {formatShortcut(item.shortcut)}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>
            💡 <strong>Tip:</strong> Press{" "}
            <kbd className="rounded bg-background px-1">?</kbd> anytime to view
            this help
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
