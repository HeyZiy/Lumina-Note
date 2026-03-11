import { describe, expect, it } from "vitest";
import { resolveMountedOpenClawWorkspacePath } from "./openClawWorkspaceSectionModel";

describe("resolveMountedOpenClawWorkspacePath", () => {
  it("returns null when neither a draft path nor an attached path exists", () => {
    expect(resolveMountedOpenClawWorkspacePath("", null)).toBeNull();
    expect(resolveMountedOpenClawWorkspacePath("   ", null)).toBeNull();
  });

  it("prefers the explicit draft path over the attached path", () => {
    expect(
      resolveMountedOpenClawWorkspacePath(
        " /Users/blueberrycongee/.openclaw/workspace ",
        "/tmp/previous-openclaw",
      ),
    ).toBe("/Users/blueberrycongee/.openclaw/workspace");
  });

  it("falls back to the attached path but never to the host Lumina workspace", () => {
    expect(resolveMountedOpenClawWorkspacePath("", "/tmp/openclaw")).toBe("/tmp/openclaw");
  });
});
