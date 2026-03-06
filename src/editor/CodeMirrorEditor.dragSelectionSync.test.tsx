import { describe, expect, it, vi } from 'vitest';
import * as CodeMirrorEditorModule from './CodeMirrorEditor';

describe('CodeMirror drag selection sync helper', () => {
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
