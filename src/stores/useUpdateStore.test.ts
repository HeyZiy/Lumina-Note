import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { checkMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}));

import { checkForUpdate, useUpdateStore } from "./useUpdateStore";

describe("useUpdateStore.checkForUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkMock.mockReset();
    useUpdateStore.persist?.clearStorage?.();
    useUpdateStore.setState({
      lastCheckTime: 0,
      skippedVersions: [],
      checkCooldownHours: 24,
      availableUpdate: null,
      updateHandle: null,
      hasUnreadUpdate: false,
      isChecking: false,
      installTelemetry: {
        sessionId: 0,
        taskId: null,
        phase: "idle",
        attempt: 0,
        progress: 0,
        downloadedBytes: 0,
        contentLength: 0,
        startedAt: null,
        updatedAt: null,
        finishedAt: null,
        error: null,
        errorCode: null,
        resumable: false,
        retryDelayMs: null,
        lastHttpStatus: null,
        canResumeAfterRestart: false,
        capability: "unknown",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes timeout options to updater check", async () => {
    checkMock.mockResolvedValue(null);

    const pending = checkForUpdate(true);
    await vi.runAllTimersAsync();
    const hasUpdate = await pending;

    expect(hasUpdate).toBe(false);
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }));
  });

  it("retries transient failures with backoff and eventually succeeds", async () => {
    checkMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ available: true, version: "9.9.9", body: "notes", date: "2026-03-05" });

    const pending = checkForUpdate(true);
    await vi.runAllTimersAsync();
    const hasUpdate = await pending;

    expect(hasUpdate).toBe(true);
    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(useUpdateStore.getState().availableUpdate?.version).toBe("9.9.9");
  });

  it("maps resumable update events into observable telemetry", () => {
    const state = useUpdateStore.getState() as any;

    state.applyResumableEvent({
      type: "started",
      taskId: "task-1",
      version: "9.9.9",
      attempt: 1,
      downloadedBytes: 0,
      totalBytes: 1024,
      resumable: true,
      stage: "downloading",
      timestamp: Date.now(),
    });

    state.applyResumableEvent({
      type: "progress",
      taskId: "task-1",
      version: "9.9.9",
      attempt: 1,
      downloadedBytes: 512,
      totalBytes: 1024,
      resumable: true,
      stage: "downloading",
      timestamp: Date.now(),
    });

    const telemetry = (useUpdateStore.getState() as any).installTelemetry;
    expect(telemetry.taskId).toBe("task-1");
    expect(telemetry.resumable).toBe(true);
    expect(telemetry.phase).toBe("downloading");
    expect(telemetry.downloadedBytes).toBe(512);
    expect(telemetry.contentLength).toBe(1024);
    expect(telemetry.progress).toBe(50);
    expect(telemetry.canResumeAfterRestart).toBe(true);
  });

  it("restores resumable status after app restart", () => {
    const state = useUpdateStore.getState() as any;
    state.hydrateResumableStatus({
      taskId: "task-restart",
      version: "9.9.9",
      attempt: 2,
      downloadedBytes: 768,
      totalBytes: 1024,
      resumable: true,
      stage: "downloading",
      status: "downloading",
      timestamp: Date.now(),
    });

    const telemetry = (useUpdateStore.getState() as any).installTelemetry;
    expect(telemetry.taskId).toBe("task-restart");
    expect(telemetry.attempt).toBe(2);
    expect(telemetry.phase).toBe("downloading");
    expect(telemetry.downloadedBytes).toBe(768);
    expect(telemetry.progress).toBe(75);
  });
});
