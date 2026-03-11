import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  inspectOpenClawWorkspace,
  inspectOpenClawWorkspaceTree,
  type OpenClawWorkspaceSnapshot,
} from "@/services/openclaw/workspace";
import type { FileEntry } from "@/lib/tauri";
import type { OpenClawConflictState, OpenClawWorkspaceAttachment } from "@/types/openclaw";

type AttachWorkspaceInput = {
  workspacePath: string;
  gateway?: Partial<OpenClawWorkspaceAttachment["gateway"]>;
};

interface OpenClawWorkspaceState {
  integrationEnabled: boolean;
  snapshotsByPath: Record<string, OpenClawWorkspaceSnapshot>;
  attachmentsByPath: Record<string, OpenClawWorkspaceAttachment>;
  conflictsByPath: Record<string, OpenClawConflictState>;
  activeWorkspacePath: string | null;
  isRefreshing: boolean;
  lastError: string | null;
  setIntegrationEnabled: (enabled: boolean) => void;
  refreshWorkspace: (path?: string | null) => Promise<OpenClawWorkspaceSnapshot | null>;
  getSnapshot: (path?: string | null) => OpenClawWorkspaceSnapshot | null;
  clearSnapshot: (path: string) => void;
  getAttachment: (path?: string | null) => OpenClawWorkspaceAttachment | null;
  attachWorkspace: (input: AttachWorkspaceInput) => OpenClawWorkspaceAttachment;
  detachWorkspace: (path: string) => void;
  updateGateway: (
    workspacePath: string,
    gateway: Partial<OpenClawWorkspaceAttachment["gateway"]>,
  ) => OpenClawWorkspaceAttachment | null;
  refreshAttachmentScan: (
    workspacePath: string,
    fileTree?: FileEntry[],
  ) => OpenClawWorkspaceAttachment | null;
  recordExternalChange: (workspacePath: string, paths: string[], dirtyPaths?: string[]) => void;
  getConflictState: (path?: string | null) => OpenClawConflictState | null;
  clearConflictState: (path: string) => void;
  markUnavailable: (path: string) => void;
}

function toIsoString(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function applySnapshotToAttachment(
  attachment: OpenClawWorkspaceAttachment,
  snapshot: OpenClawWorkspaceSnapshot,
): OpenClawWorkspaceAttachment {
  return {
    ...attachment,
    status: snapshot.status === "error" ? "unavailable" : "attached",
    lastValidatedAt: toIsoString(snapshot.checkedAt),
    detectedFiles: snapshot.editablePriorityFiles,
    detectedFolders: snapshot.matchedDirectories,
  };
}

export const useOpenClawWorkspaceStore = create<OpenClawWorkspaceState>()(
  persist(
    (set, get) => ({
      integrationEnabled: true,
      snapshotsByPath: {},
      attachmentsByPath: {},
      conflictsByPath: {},
      activeWorkspacePath: null,
      isRefreshing: false,
      lastError: null,
      setIntegrationEnabled: (enabled) => {
        set((state) => ({
          integrationEnabled: enabled,
          activeWorkspacePath: enabled ? state.activeWorkspacePath : null,
        }));
      },
      refreshWorkspace: async (path) => {
        if (!get().integrationEnabled) {
          return null;
        }
        if (!path) {
          set({ activeWorkspacePath: null, isRefreshing: false, lastError: null });
          return null;
        }

        set({ activeWorkspacePath: path, isRefreshing: true, lastError: null });
        const snapshot = await inspectOpenClawWorkspace(path);
        set((state) => ({
          snapshotsByPath: {
            ...state.snapshotsByPath,
            [path]: snapshot,
          },
          attachmentsByPath: state.attachmentsByPath[path]
            ? {
                ...state.attachmentsByPath,
                [path]: applySnapshotToAttachment(state.attachmentsByPath[path], snapshot),
              }
            : state.attachmentsByPath,
          activeWorkspacePath: path,
          isRefreshing: false,
          lastError: snapshot.status === "error" ? snapshot.error : null,
        }));
        return snapshot;
      },
      getSnapshot: (path) => {
        if (!get().integrationEnabled) return null;
        const targetPath = path ?? get().activeWorkspacePath;
        if (!targetPath) return null;
        return get().snapshotsByPath[targetPath] ?? null;
      },
      clearSnapshot: (path) =>
        set((state) => {
          const next = { ...state.snapshotsByPath };
          delete next[path];
          return {
            snapshotsByPath: next,
            activeWorkspacePath: state.activeWorkspacePath === path ? null : state.activeWorkspacePath,
          };
        }),
      getAttachment: (path) => {
        if (!get().integrationEnabled) return null;
        const targetPath = path ?? get().activeWorkspacePath;
        if (!targetPath) return null;
        return get().attachmentsByPath[targetPath] ?? null;
      },
      attachWorkspace: ({ workspacePath, gateway }) => {
        if (!get().integrationEnabled) {
          throw new Error("OpenClaw integration is disabled.");
        }
        const nowIso = new Date().toISOString();
        const existing = get().attachmentsByPath[workspacePath];
        const attachment: OpenClawWorkspaceAttachment = existing
          ? {
              ...existing,
              gateway: {
                ...existing.gateway,
                ...gateway,
              },
            }
          : {
              kind: "openclaw",
              workspacePath,
              status: "attached",
              attachedAt: nowIso,
              lastValidatedAt: null,
              detectedFiles: [],
              detectedFolders: [],
              gateway: {
                enabled: gateway?.enabled ?? false,
                endpoint: gateway?.endpoint ?? null,
              },
              unavailableReason: null,
            };
        set((state) => ({
          attachmentsByPath: {
            ...state.attachmentsByPath,
            [workspacePath]: attachment,
          },
          activeWorkspacePath: workspacePath,
        }));
        return attachment;
      },
      detachWorkspace: (path) =>
        set((state) => {
          const next = { ...state.attachmentsByPath };
          const nextConflicts = { ...state.conflictsByPath };
          delete next[path];
          delete nextConflicts[path];
          return { attachmentsByPath: next, conflictsByPath: nextConflicts };
        }),
      updateGateway: (workspacePath, gateway) => {
        if (!get().integrationEnabled) return null;
        const current = get().attachmentsByPath[workspacePath];
        if (!current) return null;
        const next = {
          ...current,
          gateway: {
            ...current.gateway,
            ...gateway,
          },
        };
        set((state) => ({
          attachmentsByPath: {
            ...state.attachmentsByPath,
            [workspacePath]: next,
          },
        }));
        return next;
      },
      refreshAttachmentScan: (workspacePath, fileTree) => {
        if (!get().integrationEnabled) {
          return null;
        }
        const snapshot = fileTree
          ? inspectOpenClawWorkspaceTree(workspacePath, fileTree)
          : get().getSnapshot(workspacePath);
        if (!snapshot) {
          return get().getAttachment(workspacePath);
        }
        const existingAttachment = get().attachmentsByPath[workspacePath];
        set((state) => ({
          snapshotsByPath: {
            ...state.snapshotsByPath,
            [workspacePath]: snapshot,
          },
          attachmentsByPath: existingAttachment
            ? {
                ...state.attachmentsByPath,
                [workspacePath]: applySnapshotToAttachment(existingAttachment, snapshot),
              }
            : state.attachmentsByPath,
          activeWorkspacePath: workspacePath,
          lastError: snapshot.status === "error" ? snapshot.error : null,
        }));
        return existingAttachment
          ? applySnapshotToAttachment(existingAttachment, snapshot)
          : null;
      },
      recordExternalChange: (workspacePath, paths, dirtyPaths = []) => {
        const attachment = get().attachmentsByPath[workspacePath];
        if (!attachment || attachment.status !== "attached") {
          return;
        }
        const normalizedDirty = new Set(dirtyPaths);
        const conflictingPaths = paths.filter((path) => normalizedDirty.has(path));
        if (conflictingPaths.length === 0) {
          return;
        }
        set((state) => ({
          conflictsByPath: {
            ...state.conflictsByPath,
            [workspacePath]: {
              workspacePath,
              status: "warning",
              files: Array.from(new Set(conflictingPaths)),
              lastDetectedAt: new Date().toISOString(),
              message: `OpenClaw updated ${conflictingPaths.length} file(s) that also have unsaved edits in Lumina.`,
            },
          },
        }));
      },
      getConflictState: (path) => {
        if (!get().integrationEnabled) return null;
        const targetPath = path ?? get().activeWorkspacePath;
        if (!targetPath) return null;
        return get().conflictsByPath[targetPath] ?? null;
      },
      clearConflictState: (path) =>
        set((state) => {
          const next = { ...state.conflictsByPath };
          delete next[path];
          return { conflictsByPath: next };
        }),
      markUnavailable: (path) =>
        set((state) => ({
          attachmentsByPath: state.attachmentsByPath[path]
            ? {
                ...state.attachmentsByPath,
                [path]: {
                  ...state.attachmentsByPath[path],
                  status: "unavailable",
                  lastValidatedAt: new Date().toISOString(),
                  unavailableReason: "Workspace path is unavailable or could not be refreshed.",
                },
              }
            : state.attachmentsByPath,
          conflictsByPath: state.conflictsByPath[path]
            ? {
                ...state.conflictsByPath,
                [path]: {
                  ...state.conflictsByPath[path],
                  status: "warning",
                  lastDetectedAt: new Date().toISOString(),
                  message: "Workspace path is unavailable or could not be refreshed.",
                },
              }
            : state.conflictsByPath,
        })),
    }),
    {
      name: "lumina-openclaw-workspaces",
      partialize: (state) => ({
        integrationEnabled: state.integrationEnabled,
        snapshotsByPath: state.snapshotsByPath,
        attachmentsByPath: state.attachmentsByPath,
        conflictsByPath: state.conflictsByPath,
        activeWorkspacePath: state.activeWorkspacePath,
      }),
    },
  ),
);
