import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MacTopChrome } from "./MacTopChrome";

const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  platform: vi.fn(() => "linux"),
}));

vi.mock("@tauri-apps/api/core", async () => {
  const actual = await vi.importActual<typeof import("@tauri-apps/api/core")>(
    "@tauri-apps/api/core",
  );
  return {
    ...actual,
    isTauri: tauriMocks.isTauri,
  };
});

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: tauriMocks.platform,
}));

describe("MacTopChrome", () => {
  beforeEach(() => {
    tauriMocks.isTauri.mockReset();
    tauriMocks.isTauri.mockReturnValue(false);
    tauriMocks.platform.mockReset();
    tauriMocks.platform.mockReturnValue("linux");
  });

  it("renders nothing outside macOS tauri", async () => {
    const { container } = render(<MacTopChrome title="Lumina Note" />);

    await waitFor(() => {
      expect(tauriMocks.platform).not.toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders a draggable top chrome with actions on macOS tauri", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.platform.mockReturnValue("macos");

    render(
      <MacTopChrome
        title="Current Thread"
        actions={<button type="button">Open</button>}
      />,
    );

    await waitFor(() => {
      expect(tauriMocks.platform).toHaveBeenCalled();
    });

    expect(screen.getByTestId("mac-top-chrome")).toHaveAttribute("data-tauri-drag-region", "true");
    expect(screen.getByTestId("mac-top-chrome-actions")).toHaveAttribute("data-tauri-drag-region", "false");
    expect(screen.getByText("Current Thread")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
