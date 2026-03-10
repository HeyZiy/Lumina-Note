import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, render } from '@testing-library/react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { useUIStore } from '@/stores/useUIStore';

declare global {
  interface Window {
    __cmSelectionTrace?: any;
    __luminaEditorTrace?: any;
    __cmSelectionTraceSessionId?: string;
    __luminaEditorTraceSessionId?: string;
  }
}

describe('CodeMirror editor interaction trace API', () => {
  afterEach(() => {
    cleanup();
    delete window.__cmSelectionTrace;
    delete window.__luminaEditorTrace;
    delete window.__cmSelectionTraceSessionId;
    delete window.__luminaEditorTraceSessionId;
    localStorage.removeItem('cmSelectionVisualTrace');
    useUIStore.setState({ editorInteractionTraceEnabled: false });
  });

  it('exposes a lumina trace alias that can capture custom interaction markers', () => {
    render(<CodeMirrorEditor content={'Line 1\nLine 2'} onChange={vi.fn()} viewMode="live" />);

    expect(window.__luminaEditorTrace).toBeTruthy();
    expect(window.__luminaEditorTrace).toBe(window.__cmSelectionTrace);
    expect(window.__luminaEditorTraceSessionId).toBe(window.__cmSelectionTraceSessionId);

    window.__luminaEditorTrace.enable(false);
    window.__luminaEditorTrace.mark('test-interaction-event', { source: 'unit-test' });

    const data = window.__luminaEditorTrace.getData();
    expect(data.events.some((event: any) => event.type === 'test-interaction-event')).toBe(true);
  });

  it('records wheel and pointer events while interaction tracing is enabled', () => {
    useUIStore.setState({ editorInteractionTraceEnabled: true });
    const { container } = render(
      <CodeMirrorEditor content={'Line 1\nLine 2\nLine 3'} onChange={vi.fn()} viewMode="live" />,
    );

    const content = container.querySelector('.cm-content') as HTMLElement;
    expect(content).toBeTruthy();

    fireEvent.pointerDown(content, {
      clientX: 120,
      clientY: 180,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
    });
    fireEvent.wheel(content, {
      clientX: 120,
      clientY: 180,
      deltaY: 48,
    });

    const data = window.__luminaEditorTrace.getData();
    expect(data.events.some((event: any) => event.type === 'content-pointerdown')).toBe(true);
    expect(data.events.some((event: any) => event.type === 'editor-wheel')).toBe(true);
  });
});
