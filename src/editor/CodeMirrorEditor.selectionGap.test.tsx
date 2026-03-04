import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { CodeMirrorEditor } from './CodeMirrorEditor';

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

describe('CodeMirror live selection gap bridge', () => {
  afterEach(() => {
    cleanup();
  });

  it('adds selection gap highlight for header spacing', () => {
    const { container, view } = setupEditor('## Heading');
    act(() => {
      view.dispatch({ selection: { anchor: 3, head: 10 } });
    });
    const gap = container.querySelector('.cm-selection-gap');
    expect(gap).not.toBeNull();
    expect(gap?.textContent).toBe(' ');
  });

  it('adds selection bridge for inline formatting marks', () => {
    const { container, view } = setupEditor('**bold**');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 8 } });
    });
    const markers = Array.from(container.querySelectorAll('.cm-selection-bridge')).filter(
      (el) => el.textContent === '**',
    );
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it('does not add selection gap when selection is empty', () => {
    const { container, view } = setupEditor('## Heading\n\n**bold**');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    expect(container.querySelector('.cm-selection-gap')).toBeNull();
    expect(container.querySelector('.cm-selection-bridge')).toBeNull();
  });

  it('selects full document on beforeinput selectAll', () => {
    const { view } = setupEditor('Line 1\nLine 2\nLine 3');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    const event = new Event('beforeinput', { bubbles: true, cancelable: true }) as InputEvent;
    Object.defineProperty(event, 'inputType', { value: 'selectAll' });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it('selects full document on Mod-A keydown', () => {
    const { view } = setupEditor('Alpha\nBeta\nGamma');
    act(() => {
      view.dispatch({ selection: { anchor: 2, head: 2 } });
    });
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it('does not upgrade viewport-covering selection to full document without select-all intent', () => {
    const content = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} - sample text`).join('\n');
    const { container, view } = setupEditor(content);
    const contentDom = container.querySelector('.cm-content');
    if (!contentDom) {
      throw new Error('CodeMirror content DOM not found');
    }

    const lines = Array.from(contentDom.querySelectorAll('.cm-line'));
    let targetNode: Text | null = null;
    let targetOffset = 0;
    for (const line of lines) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode() as Text | null;
      if (!textNode) continue;
      let pos = -1;
      try {
        pos = view.posAtDOM(textNode, textNode.textContent?.length ?? 0);
      } catch {
        continue;
      }
      if (pos >= view.viewport.to && pos < view.state.doc.length) {
        targetNode = textNode;
        targetOffset = textNode.textContent?.length ?? 0;
        break;
      }
    }

    if (!targetNode) {
      throw new Error('Failed to find a DOM range that covers viewport without full document');
    }

    const firstLine = lines[0];
    const firstWalker = document.createTreeWalker(firstLine, NodeFilter.SHOW_TEXT);
    const firstTextNode = firstWalker.nextNode() as Text | null;
    if (!firstTextNode) {
      throw new Error('First line text node not found');
    }

    const selection = document.getSelection();
    if (!selection) {
      throw new Error('Document selection is not available');
    }

    const range = document.createRange();
    range.setStart(firstTextNode, 0);
    range.setEnd(targetNode, targetOffset);

    act(() => {
      view.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBeLessThan(view.state.doc.length);
  });

  it('enables drawSelection layer for select-all', () => {
    const { container, view } = setupEditor('Line 1\nLine 2\nLine 3');
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    });
    expect(container.querySelector('.cm-selectionLayer')).not.toBeNull();
  });

  it('keeps code block in inline mode when selection only touches its boundary', () => {
    const content = '## JSON\n```json\n{"name":"demo"}\n```';
    const { container, view } = setupEditor(content);

    // Select heading line including newline; selection end equals code fence start.
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 8 } });
    });

    // Inline mode: header widget stays, fences hidden
    expect(container.querySelector('.cm-codeblock-header')).not.toBeNull();
    expect(container.textContent ?? '').not.toContain('```json');
  });

  it('keeps code block in inline mode when selection crosses into it from heading', () => {
    const content = '## JSON\n```json\n{"name":"demo"}\n```';
    const { container, view } = setupEditor(content);

    // Slightly overshoot from heading into the first fence char.
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 9 } });
    });

    // Inline mode: header widget stays, fences hidden
    expect(container.querySelector('.cm-codeblock-header')).not.toBeNull();
    expect(container.textContent ?? '').not.toContain('```json');
  });

  it('keeps code content editable in inline mode when caret is inside', () => {
    const content = '## JSON\n```json\n{"name":"demo"}\n```';
    const { container, view } = setupEditor(content);

    // Place caret inside fenced code content.
    act(() => {
      view.dispatch({ selection: { anchor: 17, head: 17 } });
    });

    // Inline mode: fences stay hidden, content is in contentDOM
    expect(container.querySelector('.cm-codeblock-header')).not.toBeNull();
    expect(container.querySelector('.cm-codeblock-content')).not.toBeNull();
  });

  it('renders code block header without external margin utility classes', () => {
    const content = '```json\n{"name":"demo"}\n```';
    const { container } = setupEditor(content);
    const header = container.querySelector('.cm-codeblock-header');
    expect(header).not.toBeNull();
    expect(header?.className.includes('my-2')).toBe(false);
  });

  it('keeps list and quote marks visible when another line is active', () => {
    const content = 'Paragraph\n- item\n> quote\n# heading';
    const { container, view } = setupEditor(content);

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const visibleBlockTexts = Array.from(
      container.querySelectorAll('.cm-formatting-block.cm-formatting-block-visible'),
    ).map((el) => el.textContent ?? '');

    expect(visibleBlockTexts.some((text) => text.includes('-'))).toBe(true);
    expect(visibleBlockTexts.some((text) => text.includes('>'))).toBe(true);
  });

  it('adds mark decoration for selection inside code block content', () => {
    const content = '```javascript\nconsole.log("hi")\n```';
    const { container, view } = setupEditor(content);

    // Select inside the code block content
    const codeStart = content.indexOf('console');
    const codeEnd = content.indexOf(')\n```');
    act(() => {
      view.dispatch({ selection: { anchor: codeStart, head: codeEnd } });
    });

    // The library's codeBlockSelectionPlugin should add .cm-codeblock-sel marks
    const selMarks = container.querySelectorAll('.cm-codeblock-sel');
    expect(selMarks.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps heading mark collapsed when heading line is not active', () => {
    const content = 'Paragraph\n# Heading';
    const { container, view } = setupEditor(content);

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const headingMark = Array.from(container.querySelectorAll('.cm-formatting-block')).find((el) =>
      (el.textContent ?? '').includes('#'),
    );

    expect(headingMark).toBeDefined();
    expect(headingMark?.classList.contains('cm-formatting-block-visible')).toBe(false);
  });
});
