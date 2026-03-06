# Editor Sidebar Hover Restraint Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the editor sidebar hover treatment nearly imperceptible by removing the decorative edge glow and replacing it with a subtle surface shift.

**Architecture:** Extract the sidebar shell class into a small helper so the hover treatment is testable in isolation, then update `Sidebar` to consume that helper. Verify the class contract with a focused unit test before wiring it into the component.

**Tech Stack:** React, TypeScript, TailwindCSS, Vitest

---

### Task 1: Add a failing style-contract test

**Files:**
- Create: `src/components/layout/sidebarSurface.test.ts`
- Create: `src/components/layout/sidebarSurface.ts`

**Step 1: Write the failing test**

Assert that the exported sidebar shell class:
- keeps the glass surface foundation
- does not include any `after:` glow classes
- uses only muted hover feedback classes

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/layout/sidebarSurface.test.ts`

**Step 3: Write minimal implementation**

Export a single class string constant from `sidebarSurface.ts`.

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/layout/sidebarSurface.test.ts`

---

### Task 2: Wire the class into the sidebar component

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/sidebarSurface.ts`

**Step 1: Replace inline shell class**

Use the extracted class constant in the top-level `<aside>`.

**Step 2: Keep the change atomic**

Do not alter sidebar logic, spacing, or child button behavior.

**Step 3: Re-run focused test**

Run: `npm run test:run -- src/components/layout/sidebarSurface.test.ts`

---

### Task 3: Verify no regressions in adjacent layout code

**Files:**
- Test: `src/components/layout/sidebarSurface.test.ts`

**Step 1: Run targeted verification**

Run: `npm run test:run -- src/components/layout/sidebarSurface.test.ts`

**Step 2: Run one broader command if fast enough**

Run: `npm run test:run -- src/components/profile/ProfilePreview.test.tsx`

**Step 3: Manual visual follow-up**

In the app, hover the left sidebar in light and dark themes and confirm the surface shift is visible only when looking for it.
