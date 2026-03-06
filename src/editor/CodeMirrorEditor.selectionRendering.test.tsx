import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { setMouseSelecting } from 'codemirror-live-markdown';
import { CodeMirrorEditor } from './CodeMirrorEditor';

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
  return { container, view };
}

describe('CodeMirror selection rendering in Tauri WebKit path', () => {
  afterEach(() => {
    cleanup();
    delete window.__cmForceDisableDrawSelection;
  });

  it('keeps selection bridge visible during drag when drawSelection is disabled', () => {
    window.__cmForceDisableDrawSelection = true;
    const { container, view } = setupEditor('## Heading');

    act(() => {
      view.dispatch({ selection: { anchor: 3, head: 10 } });
    });

    const before = container.querySelectorAll('.cm-selection-gap, .cm-selection-bridge').length;
    expect(before).toBeGreaterThanOrEqual(1);

    act(() => {
      view.dispatch({ effects: setMouseSelecting.of(true), selection: { anchor: 4, head: 10 } });
    });

    const during = container.querySelectorAll('.cm-selection-gap, .cm-selection-bridge').length;
    expect(during).toBeGreaterThanOrEqual(1);
  });
});
