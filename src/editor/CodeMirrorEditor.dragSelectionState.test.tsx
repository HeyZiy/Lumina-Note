import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { setMouseSelecting } from 'codemirror-live-markdown';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import * as CodeMirrorEditorModule from './CodeMirrorEditor';

declare global {
  interface Window {
    __cmForceDisableDrawSelection?: boolean;
  }
}

function setupEditor(content: string) {
  const onChange = vi.fn();
  const { container } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />,
  );
  const editor = container.querySelector('.cm-editor');
  if (!editor) {
    throw new Error('CodeMirror editor root not found');
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error('EditorView instance not found');
  }
  return { container, view, root: editor as HTMLElement };
}

describe('CodeMirror drag selection class state', () => {
  afterEach(() => {
    cleanup();
    delete window.__cmForceDisableDrawSelection;
  });

  it('toggles cm-drag-selecting class when mouseSelecting state changes', () => {
    const { view, root } = setupEditor('Line 1\nLine 2\nLine 3');

    expect(root.classList.contains('cm-drag-selecting')).toBe(false);

    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
    });
    expect(root.classList.contains('cm-drag-selecting')).toBe(true);

    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(false) });
    });
    expect(root.classList.contains('cm-drag-selecting')).toBe(false);
  });

  it('adds native-selection suppression class during drag in Tauri WebKit path', () => {
    window.__cmForceDisableDrawSelection = true;
    const { view, root } = setupEditor('Line 1\nLine 2\nLine 3');

    expect(root.classList.contains('cm-drag-native-selection-suppressed')).toBe(false);

    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true) });
    });

    expect(root.classList.contains('cm-drag-native-selection-suppressed')).toBe(true);

    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(false) });
    });

    expect(root.classList.contains('cm-drag-native-selection-suppressed')).toBe(false);
  });

  it('cancels CodeMirror native mouse selection when manual drag sync takes ownership', () => {
    expect(typeof (CodeMirrorEditorModule as any).cancelNativeMouseSelectionForManualDrag).toBe(
      'function',
    );

    const destroy = vi.fn();
    const view = {
      inputState: {
        mouseSelection: {
          destroy,
        },
      },
    };

    const changed = (CodeMirrorEditorModule as any).cancelNativeMouseSelectionForManualDrag(view);

    expect(changed).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no active CodeMirror mouse selection to cancel', () => {
    const view = {
      inputState: {
        mouseSelection: null,
      },
    };

    const changed = (CodeMirrorEditorModule as any).cancelNativeMouseSelectionForManualDrag(view);

    expect(changed).toBe(false);
  });
});
