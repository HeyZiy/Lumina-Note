import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

function setupEditor(content: string) {
  const onChange = vi.fn();
  const { container } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />
  );
  const editor = container.querySelector(".cm-editor");
  if (!editor) {
    throw new Error("CodeMirror editor root not found");
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error("EditorView instance not found");
  }
  return { container, view, onChange };
}

function clickCodeLine(line: HTMLElement) {
  line.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 8 })
  );
  line.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 8 })
  );
  line.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 8 })
  );
}

function findTextNode(root: Node, value: string): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.textContent?.includes(value)) {
      return current as Text;
    }
    current = walker.nextNode();
  }
  return null;
}

describe("CodeMirror live code block editing behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("places caret inside code content when clicking rendered code block", () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container, view } = setupEditor(content);
    const codeStart = content.indexOf("const token = 1;");
    const codeEnd = codeStart + "const token = 1;".length;

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const line = container.querySelector(
      ".cm-codeblock-widget .cm-codeblock-line[data-line-index='0']"
    ) as HTMLElement | null;

    expect(line).not.toBeNull();
    if (!line) return;

    act(() => {
      clickCodeLine(line);
    });

    const pos = view.state.selection.main.from;
    expect(pos).toBeGreaterThanOrEqual(codeStart);
    expect(pos).toBeLessThanOrEqual(codeEnd);
  });

  it("deletes selected text after selecting inside rendered code block", () => {
    const content = "Before\n\n```js\nDELETE_ME\n```\nAfter";
    const { container, view } = setupEditor(content);
    const codeLine = container.querySelector(
      ".cm-codeblock-widget .cm-codeblock-line[data-line-index='0']"
    ) as HTMLElement | null;

    expect(codeLine).not.toBeNull();
    if (!codeLine) return;

    const textNode = findTextNode(codeLine, "DELETE_ME");
    expect(textNode).not.toBeNull();
    if (!textNode) return;
    const offset = textNode.textContent?.indexOf("DELETE_ME") ?? -1;
    expect(offset).toBeGreaterThanOrEqual(0);
    if (offset < 0) return;

    const range = document.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset + "DELETE_ME".length);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(view.state.doc.toString()).toContain("DELETE_ME");

    act(() => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
      );
    });

    expect(view.state.doc.toString()).not.toContain("DELETE_ME");
  });
});
