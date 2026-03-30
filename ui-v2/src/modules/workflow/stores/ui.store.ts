import { create } from "zustand";
import type { FlowNode } from "../types/react-flow-cots";

interface UIStore {
  // Drawer and dialog states
  isDrawerOpen: boolean;
  isNodeConfigOpen: boolean;
  isScenarioDialogOpen: boolean;
  isLogsOpen: boolean;
  isShortcutsOpen: boolean;

  // Selected node for config
  selectedNode: FlowNode | null;

  // Actions
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  openNodeConfig: (node: FlowNode) => void;
  closeNodeConfig: () => void;

  openScenarios: () => void;
  closeScenarios: () => void;
  toggleScenarios: () => void;

  openLogs: () => void;
  closeLogs: () => void;
  toggleLogs: () => void;

  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleShortcuts: () => void;

  // Close all dialogs (useful for Escape key)
  closeAll: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isDrawerOpen: false,
  isNodeConfigOpen: false,
  isScenarioDialogOpen: false,
  isLogsOpen: false,
  isShortcutsOpen: false,
  selectedNode: null,

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

  openNodeConfig: (node) => set({ isNodeConfigOpen: true, selectedNode: node }),
  closeNodeConfig: () => set({ isNodeConfigOpen: false, selectedNode: null }),

  openScenarios: () => set({ isScenarioDialogOpen: true }),
  closeScenarios: () => set({ isScenarioDialogOpen: false }),
  toggleScenarios: () =>
    set((state) => ({ isScenarioDialogOpen: !state.isScenarioDialogOpen })),

  openLogs: () => set({ isLogsOpen: true }),
  closeLogs: () => set({ isLogsOpen: false }),
  toggleLogs: () => set((state) => ({ isLogsOpen: !state.isLogsOpen })),

  openShortcuts: () => set({ isShortcutsOpen: true }),
  closeShortcuts: () => set({ isShortcutsOpen: false }),
  toggleShortcuts: () =>
    set((state) => ({ isShortcutsOpen: !state.isShortcutsOpen })),

  closeAll: () =>
    set({
      isDrawerOpen: false,
      isNodeConfigOpen: false,
      isScenarioDialogOpen: false,
      isLogsOpen: false,
      isShortcutsOpen: false,
      selectedNode: null,
    }),
}));
