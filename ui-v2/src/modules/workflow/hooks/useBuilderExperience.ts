"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AuthoringMode,
  persistBuilderMode,
  persistChecklistDismissal,
  readBuilderExperience,
} from "../lib/builder-experience";

export function useBuilderExperience(userId: string | null) {
  const [mode, setModeState] = useState<AuthoringMode>("guided");
  const [checklistDismissed, setChecklistDismissedState] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(false);
    const experience = readBuilderExperience(
      typeof window === "undefined" ? undefined : window.localStorage,
      userId,
    );
    setModeState(experience.mode);
    setChecklistDismissedState(experience.checklistDismissed);
    setIsReady(true);
  }, [userId]);

  const setMode = useCallback(
    (nextMode: AuthoringMode) => {
      setModeState(nextMode);
      persistBuilderMode(
        typeof window === "undefined" ? undefined : window.localStorage,
        userId,
        nextMode,
      );
    },
    [userId],
  );

  const setChecklistDismissed = useCallback(
    (dismissed: boolean) => {
      setChecklistDismissedState(dismissed);
      persistChecklistDismissal(
        typeof window === "undefined" ? undefined : window.localStorage,
        userId,
        dismissed,
      );
    },
    [userId],
  );

  return {
    mode,
    setMode,
    checklistDismissed,
    dismissChecklist: () => setChecklistDismissed(true),
    restoreChecklist: () => setChecklistDismissed(false),
    isReady,
  };
}
