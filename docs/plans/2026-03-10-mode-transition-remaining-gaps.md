# Mode Transition Remaining Gaps

Recorded 2026-03-10 after fixing the edit-to-view stale selection bug.

These are known gaps in the cross-mode anchor restoration system that are not yet addressed. Each references the invariant it weakens.

## Gap 1: Double-RAF may produce visible two-step repositioning (Invariant 4)

`applyModeTransitionPlan()` runs restoration in two consecutive `requestAnimationFrame` callbacks. The browser renders between RAF-1 and RAF-2. If RAF-1's `coordsAtPos()` returns inaccurate coordinates (layout still settling from extension reconfigure), RAF-2 corrects it — producing a visible "jump to A, then settle at B" motion.

**File:** `src/editor/CodeMirrorEditor.tsx`, `applyModeTransitionPlan` (~line 3366)

**Possible fix:** Delay all visible restoration to RAF-2 only, or use a single RAF after confirming layout has settled (e.g. via `requestIdleCallback` or `MutationObserver`).

## Gap 2: First-click guard over-arms for edit-to-edit transitions (Invariant 3)

`armFirstPointerIntentOverride` is set to `true` for ALL transitions to edit mode, including `edit-to-edit` (live <-> source) where selection was already preserved. Consequences:

- Double-click as first interaction: guard calls `preventDefault()`, preventing CM's word-selection behavior.
- Edit-to-edit with preserved selection: guard is armed but unnecessary — the selection is already correct.

**File:** `src/editor/CodeMirrorEditor.tsx`, `buildModeTransitionPlan` (~line 1793)

**Possible fix:** Only arm when `!preserveSelection`, i.e. `armFirstPointerIntentOverride: targetCategory === 'edit' && !preserveSelection`.

## Gap 3: RAF timing vs. early user interaction (Invariant 3)

Between compartment reconfigure (synchronous) and RAF-1 (next frame), if the user clicks immediately, the sequence is:

1. Guard is armed (line 3406, synchronous)
2. User clicks — guard fires, sets selection to click position
3. RAF-1 fires — overwrites selection with the transition plan's `selectionToRestore`

The user's explicit click is overwritten by the deferred programmatic restore.

**File:** `src/editor/CodeMirrorEditor.tsx`, `applyModeTransitionPlan` (~line 3406-3412)

**Possible fix:** Track whether the guard has already fired (via a ref or the transition ID) and skip RAF restoration if so.

## Gap 4: Peripheral inconsistent coordinate systems (Invariant 1)

`Editor.tsx` line 107-113 has `getLineFromScrollPosition()` using `scrollTop / 28px` estimation. This is a different coordinate system from `SharedDocumentAnchor` (character position via `posAtCoords`). Currently only used for trace events, but represents a latent inconsistency.

**File:** `src/editor/Editor.tsx`, `getLineFromScrollPosition` (~line 107)

## Gap 5: `syncSelectionToViewport` exposed but unused

`CodeMirrorEditor.tsx` exposes `syncSelectionToViewport` via `useImperativeHandle` but it's never called from `Editor.tsx`. If called at the wrong time, it moves the caret without user intent. Its semantics overlap with but differ from the mode transition pipeline (no guard arming, no trace, no mode-category awareness).

**File:** `src/editor/CodeMirrorEditor.tsx`, `syncSelectionToViewport` (~line 3339)

**Possible action:** Remove if confirmed unused, or unify with the transition pipeline.
