import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rightPanelSource = readFileSync(path.resolve(__dirname, "RightPanel.tsx"), "utf8");

describe("RightPanel accent styling", () => {
  it("keeps the glass surface without painting its own left-side divider", () => {
    expect(rightPanelSource).toContain("w-full h-full bg-background/55 backdrop-blur-md flex flex-col");
    expect(rightPanelSource).not.toContain("border-l border-border/60");
    expect(rightPanelSource).not.toContain("shadow-[inset_1px_0_0_hsl(var(--border)/0.6)]");
  });

  it("strengthens active tab styling with solid primary borders and a tinted background", () => {
    expect(rightPanelSource).toContain("text-primary border-b-2 border-primary bg-primary/5");
    expect(rightPanelSource).not.toContain("text-primary border-b-2 border-primary/80 bg-background/60");
  });

  it("uses low-opacity primary empty-state icons", () => {
    expect(rightPanelSource).toContain('className="text-primary/25 mb-2"');
    expect(rightPanelSource).not.toContain('className="opacity-30 mb-2"');
  });
});
