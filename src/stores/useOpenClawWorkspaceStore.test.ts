import { beforeEach, describe, expect, it, vi } from "vitest";

const inspectMock = vi.hoisted(() => vi.fn());
const inspectTreeMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/openclaw/workspace", () => ({
  inspectOpenClawWorkspace: inspectMock,
  inspectOpenClawWorkspaceTree: inspectTreeMock,
}));

import { useOpenClawWorkspaceStore } from "./useOpenClawWorkspaceStore";

describe("useOpenClawWorkspaceStore", () => {
  beforeEach(() => {
    localStorage.clear();
    inspectMock.mockReset();
    inspectTreeMock.mockReset();
    useOpenClawWorkspaceStore.setState({
      integrationEnabled: true,
      snapshotsByPath: {},
      attachmentsByPath: {},
      conflictsByPath: {},
      activeWorkspacePath: null,
      isRefreshing: false,
      lastError: null,
    });
  });

  it("stores the refreshed snapshot for the active workspace", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: "/tmp/openclaw",
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: "/tmp/openclaw/memory",
      todayMemoryPath: "/tmp/openclaw/memory/2026-03-11.md",
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    const snapshot = await useOpenClawWorkspaceStore.getState().refreshWorkspace("/tmp/openclaw");

    expect(snapshot?.status).toBe("detected");
    expect(useOpenClawWorkspaceStore.getState().activeWorkspacePath).toBe("/tmp/openclaw");
    expect(useOpenClawWorkspaceStore.getState().getSnapshot("/tmp/openclaw")?.memoryDirectoryPath).toBe(
      "/tmp/openclaw/memory",
    );
  });

  it("clears the active workspace when refresh is called without a path", async () => {
    useOpenClawWorkspaceStore.setState({
      activeWorkspacePath: "/tmp/openclaw",
      snapshotsByPath: {
        "/tmp/openclaw": {
          workspacePath: "/tmp/openclaw",
          status: "detected",
          checkedAt: 1,
          matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
          matchedOptionalFiles: [],
          matchedDirectories: ["memory"],
          missingRequiredFiles: [],
          memoryDirectoryPath: "/tmp/openclaw/memory",
          todayMemoryPath: "/tmp/openclaw/memory/2026-03-11.md",
          artifactDirectoryPaths: [],
          planDirectoryPaths: [],
          recentMemoryPaths: [],
          planFilePaths: [],
          artifactFilePaths: [],
          artifactFileCount: 0,
          bridgeNotePaths: [],
          editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
          indexingScope: "shared-workspace",
          gatewayEnabled: false,
          error: null,
        },
      },
    });

    await useOpenClawWorkspaceStore.getState().refreshWorkspace(null);

    expect(useOpenClawWorkspaceStore.getState().activeWorkspacePath).toBeNull();
  });

  it("attaches a workspace and updates detected markers from file-tree scan", () => {
    inspectTreeMock.mockReturnValue({
      workspacePath: "/tmp/openclaw",
      status: "detected",
      checkedAt: 2,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: ["HEARTBEAT.md"],
      matchedDirectories: ["memory", "output"],
      missingRequiredFiles: [],
      memoryDirectoryPath: "/tmp/openclaw/memory",
      todayMemoryPath: "/tmp/openclaw/memory/2026-03-11.md",
      artifactDirectoryPaths: ["/tmp/openclaw/output"],
      planDirectoryPaths: ["/tmp/openclaw/output/plans"],
      recentMemoryPaths: ["/tmp/openclaw/memory/2026-03-11.md"],
      planFilePaths: ["/tmp/openclaw/output/plans/launch-plan.md"],
      artifactFilePaths: ["/tmp/openclaw/output/report.md"],
      artifactFileCount: 1,
      bridgeNotePaths: ["/tmp/openclaw/.lumina/openclaw-bridge-note-2026-03-11.md"],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    const attached = useOpenClawWorkspaceStore.getState().attachWorkspace({
      workspacePath: "/tmp/openclaw",
      gateway: { enabled: true, endpoint: "ws://127.0.0.1:8042" },
    });
    const refreshed = useOpenClawWorkspaceStore.getState().refreshAttachmentScan("/tmp/openclaw", []);

    expect(attached.status).toBe("attached");
    expect(refreshed?.detectedFiles).toEqual(["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md"]);
    expect(refreshed?.detectedFolders).toEqual(["memory", "output"]);
    expect(refreshed?.gateway.endpoint).toBe("ws://127.0.0.1:8042");
    expect(useOpenClawWorkspaceStore.getState().getSnapshot("/tmp/openclaw")?.artifactFileCount).toBe(1);
  });

  it("marks an attached workspace unavailable when the path stops refreshing", () => {
    useOpenClawWorkspaceStore.getState().attachWorkspace({
      workspacePath: "/tmp/openclaw",
    });

    useOpenClawWorkspaceStore.getState().markUnavailable("/tmp/openclaw");

    expect(useOpenClawWorkspaceStore.getState().getAttachment("/tmp/openclaw")?.status).toBe(
      "unavailable",
    );
  });

  it("stores gateway metadata updates for an attached workspace", () => {
    useOpenClawWorkspaceStore.getState().attachWorkspace({
      workspacePath: "/tmp/openclaw",
    });

    const updated = useOpenClawWorkspaceStore.getState().updateGateway("/tmp/openclaw", {
      enabled: true,
      endpoint: "ws://127.0.0.1:8042",
    });

    expect(updated?.gateway.enabled).toBe(true);
    expect(updated?.gateway.endpoint).toBe("ws://127.0.0.1:8042");
  });

  it("records a warning when external OpenClaw changes hit dirty Lumina files", () => {
    useOpenClawWorkspaceStore.getState().attachWorkspace({
      workspacePath: "/tmp/openclaw",
    });

    useOpenClawWorkspaceStore.getState().recordExternalChange(
      "/tmp/openclaw",
      ["/tmp/openclaw/AGENTS.md", "/tmp/openclaw/output/report.md"],
      ["/tmp/openclaw/AGENTS.md"],
    );

    expect(useOpenClawWorkspaceStore.getState().getConflictState("/tmp/openclaw")).toMatchObject({
      workspacePath: "/tmp/openclaw",
      status: "warning",
      files: ["/tmp/openclaw/AGENTS.md"],
    });
  });

  it("disables attachment access when integration is turned off", () => {
    useOpenClawWorkspaceStore.getState().attachWorkspace({
      workspacePath: "/tmp/openclaw",
    });

    useOpenClawWorkspaceStore.getState().setIntegrationEnabled(false);

    expect(useOpenClawWorkspaceStore.getState().getAttachment("/tmp/openclaw")).toBeNull();
    expect(useOpenClawWorkspaceStore.getState().getSnapshot("/tmp/openclaw")).toBeNull();
    expect(() =>
      useOpenClawWorkspaceStore.getState().attachWorkspace({
        workspacePath: "/tmp/openclaw",
      }),
    ).toThrow("OpenClaw integration is disabled.");
  });
});
