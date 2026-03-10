import { describe, expect, it, vi } from 'vitest';
import * as CodeMirrorEditorModule from './CodeMirrorEditor';

function markScrollable(element: HTMLElement, clientHeight: number, scrollHeight: number) {
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
}

describe('CodeMirror drag selection sync helper', () => {
  it('prefers the explicit outer scroll container when it is scrollable', () => {
    expect(typeof (CodeMirrorEditorModule as any).resolveDragScrollContainer).toBe('function');

    const owner = document.createElement('div');
    const outer = document.createElement('div');
    const editor = document.createElement('div');
    const scroller = document.createElement('div');
    owner.appendChild(outer);
    outer.appendChild(editor);
    editor.appendChild(scroller);

    markScrollable(outer, 320, 1200);
    markScrollable(scroller, 320, 900);

    const resolved = (CodeMirrorEditorModule as any).resolveDragScrollContainer(
      { dom: editor, scrollDOM: scroller },
      { current: outer },
    );

    expect(resolved).toBe(outer);
  });

  it('falls back to CodeMirror scrollDOM when no outer scroll container is provided', () => {
    const owner = document.createElement('div');
    const editor = document.createElement('div');
    const scroller = document.createElement('div');
    owner.appendChild(editor);
    editor.appendChild(scroller);

    markScrollable(scroller, 240, 1000);

    const resolved = (CodeMirrorEditorModule as any).resolveDragScrollContainer(
      { dom: editor, scrollDOM: scroller },
      null,
    );

    expect(resolved).toBe(scroller);
  });

  it('computes edge auto-scroll speed with a browser-like gradient', () => {
    expect(typeof (CodeMirrorEditorModule as any).getDragAutoScrollDelta).toBe('function');

    const scrollerRect = { top: 100, bottom: 500, height: 400 };

    const slowBottom = (CodeMirrorEditorModule as any).getDragAutoScrollDelta(448, scrollerRect);
    const fastBottom = (CodeMirrorEditorModule as any).getDragAutoScrollDelta(496, scrollerRect);
    const safeZone = (CodeMirrorEditorModule as any).getDragAutoScrollDelta(300, scrollerRect);
    const topEdge = (CodeMirrorEditorModule as any).getDragAutoScrollDelta(104, scrollerRect);

    expect(slowBottom).toBeGreaterThan(0);
    expect(fastBottom).toBeGreaterThan(slowBottom);
    expect(safeZone).toBe(0);
    expect(topEdge).toBeLessThan(0);
  });

  it('drops line clamping when the pointer enters the edge auto-scroll zone', () => {
    expect(typeof (CodeMirrorEditorModule as any).resolveDragSelectionLineRange).toBe('function');

    const hoveredLineRange = { from: 138, to: 152 };
    const scrollerRect = { top: 100, bottom: 500, height: 400 };

    expect(
      (CodeMirrorEditorModule as any).resolveDragSelectionLineRange(
        hoveredLineRange,
        260,
        scrollerRect,
      ),
    ).toEqual(hoveredLineRange);

    expect(
      (CodeMirrorEditorModule as any).resolveDragSelectionLineRange(
        hoveredLineRange,
        494,
        scrollerRect,
      ),
    ).toBeNull();

    expect(
      (CodeMirrorEditorModule as any).resolveDragSelectionLineRange(
        hoveredLineRange,
        520,
        scrollerRect,
      ),
    ).toBeNull();
  });

  it('syncs the selection head from editor coordinates in Tauri WebKit path', () => {
    expect(typeof (CodeMirrorEditorModule as any).syncDragSelectionHeadFromCoords).toBe('function');

    const dispatch = vi.fn();
    const posAtCoords = vi.fn(() => 18);
    const view = {
      state: {
        selection: {
          main: {
            anchor: 3,
            head: 3,
          },
        },
      },
      posAtCoords,
      dispatch,
    };

    (CodeMirrorEditorModule as any).syncDragSelectionHeadFromCoords(view, 3, 130, 100);

    expect(posAtCoords).toHaveBeenCalledWith({ x: 130, y: 100 });
    expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 3, head: 18 } });
  });

  it('clamps the synced head to the hovered line range when posAtCoords jumps outside it', () => {
    const dispatch = vi.fn();
    const posAtCoords = vi.fn(() => 201);
    const view = {
      state: {
        selection: {
          main: {
            anchor: 138,
            head: 151,
          },
        },
      },
      posAtCoords,
      dispatch,
    };

    (CodeMirrorEditorModule as any).syncDragSelectionHeadFromCoords(view, 138, 455, 463, {
      from: 138,
      to: 152,
    });

    expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 138, head: 152 } });
  });

  it('does not redispatch when the visible range is already identical', () => {
    const dispatch = vi.fn();
    const posAtCoords = vi.fn(() => 152);
    const view = {
      state: {
        selection: {
          main: {
            anchor: 152,
            head: 141,
            from: 141,
            to: 152,
          },
        },
      },
      posAtCoords,
      dispatch,
    };

    const changed = (CodeMirrorEditorModule as any).syncDragSelectionHeadFromCoords(view, 141, 456, 466, {
      from: 138,
      to: 152,
    });

    expect(changed).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
