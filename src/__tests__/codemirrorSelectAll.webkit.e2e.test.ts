// @vitest-environment node
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { webkit, type Browser, type Page } from 'playwright-core';

const isMac = process.platform === 'darwin';
const shouldRun = Boolean(process.env.WEBKIT_E2E);

async function startViteServer() {
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Failed to resolve dev server address');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function getVisibleSelectionCount(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller');
    if (!scroller) return 0;
    const scrollerRect = scroller.getBoundingClientRect();
    const selections = Array.from(document.querySelectorAll('.cm-selectionBackground'));
    return selections.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
    }).length;
  });
}

async function getEditorSelectionState(page: Page) {
  return page.evaluate(() => {
    const view = (window as typeof window & { __cmView?: any }).__cmView;
    if (!view) return null;
    return {
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
      length: view.state.doc.length,
      viewport: view.viewport,
    };
  });
}

describe('CodeMirror select-all (WebKit e2e)', () => {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;

  afterEach(async () => {
    if (browser) {
      await browser.close();
      browser = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  it.skipIf(!shouldRun || !isMac)(
    'keeps drag selection bounded for heading-to-heading range',
    async () => {
      const { server: startedServer, baseUrl } = await startViteServer();
      server = startedServer;

      browser = await webkit.launch({ headless: true });
      const page = await browser.newPage();
      const consoleLogs: string[] = [];
      page.on('console', (msg) => {
        consoleLogs.push(msg.text());
      });
      await page.goto(`${baseUrl}/e2e/select-all.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cm-editor');
      await page.waitForFunction(() => Boolean((window as any).__cmView));

      const dragPoints = await page.evaluate(() => {
        const view = (window as any).__cmView;
        if (!view) return null;
        (window as any).__cmSelectAllDebug = true;
        const sample = `## 1. 项目概述\n\n### 1.1 项目背景\n用户在选购手机时，往往需要根据特定需求（功能特性、性能要求、使用场景）快速找到合适的机型。本项目旨在构建一个智能手机推荐知识库系统，通过自然语言查询返回精准的手机推荐。\n\n### 1.2 项目目标\n- 支持自然语言查询，理解户意图\n- 基于多维度数据提供精准推荐\n- 返回结果包含型号、价格和推\n- 提供简单易用的 Web 界面\n\n### 1.3 核心价值\n- 快速决策：用户无需浏览大量信息，直接获得推荐\n- 智能理解：通过 LLM 理解复杂查询意图\n- 多维筛选：支持功能、性能、场景等多维度查询\n`;
        const doc = Array.from({ length: 12 }, () => sample).join('\n');
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: doc },
          selection: { anchor: 0, head: 0 },
        });

        const lines = Array.from(document.querySelectorAll('.cm-content .cm-line'));
        const startLine = lines.find((el) => (el.textContent || '').includes('## 1. 项目概述'));
        const endLine = lines.find((el) => (el.textContent || '').includes('### 1.3 核心价值'));
        if (!startLine || !endLine) return null;

        const firstTextNode = (el: Element) => {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          return w.nextNode() as Text | null;
        };
        const startNode = firstTextNode(startLine);
        const endNode = firstTextNode(endLine);
        if (!startNode || !endNode) return null;

        const pointFor = (node: Text, from: number, to: number) => {
          const range = document.createRange();
          range.setStart(node, from);
          range.setEnd(node, to);
          const rect = range.getBoundingClientRect();
          return { x: rect.left + 6, y: rect.top + rect.height / 2 };
        };

        return {
          start: pointFor(startNode, 0, Math.min(2, startNode.textContent?.length ?? 1)),
          end: pointFor(
            endNode,
            Math.max(0, (endNode.textContent?.length ?? 1) - 2),
            endNode.textContent?.length ?? 1,
          ),
        };
      });
      expect(dragPoints).not.toBeNull();
      if (!dragPoints) {
        throw new Error('Failed to prepare drag points');
      }

      await page.mouse.move(dragPoints.start.x, dragPoints.start.y);
      await page.mouse.down();
      await page.mouse.move(dragPoints.end.x, dragPoints.end.y, { steps: 24 });
      await page.mouse.up();

      const selectionState = await getEditorSelectionState(page);
      await page.waitForTimeout(80);
      const rectStats = await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller');
        if (!scroller) return null;
        const scrollerRect = scroller.getBoundingClientRect();
        const rects = Array.from(document.querySelectorAll('.cm-selectionBackground')).map((el) =>
          el.getBoundingClientRect(),
        );
        const fullLikeRects = rects.filter(
          (r) => r.width >= scrollerRect.width * 0.95 && r.height >= scrollerRect.height * 0.8,
        ).length;
        return {
          rectCount: rects.length,
          fullLikeRects,
        };
      });
      expect(rectStats).not.toBeNull();

      expect(selectionState?.from).toBe(0);
      expect((selectionState?.to ?? 0) < (selectionState?.length ?? 0)).toBe(true);
      expect(rectStats?.fullLikeRects).toBe(0);
      expect(
        consoleLogs.some((line) => line.includes('[cm-selectAll] doc-selectionchange-skip')),
      ).toBe(true);
    },
    30_000,
  );

  it.skipIf(!shouldRun || !isMac)(
    'keeps selection highlight visible after scrolling',
    async () => {
      const { server: startedServer, baseUrl } = await startViteServer();
      server = startedServer;

      browser = await webkit.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/e2e/select-all.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cm-editor');
      await page.waitForFunction(() => Boolean((window as any).__cmView));

      await page.click('.cm-content');
      await page.keyboard.press('Meta+A');

      await page.waitForFunction(() => {
        return document.querySelector('.cm-selectionLayer') !== null;
      });

      const selectionState = await getEditorSelectionState(page);

      expect(selectionState?.from).toBe(0);
      expect(selectionState?.to).toBe(selectionState?.length);

      await page.waitForFunction(() => {
        const scroller = document.querySelector('.cm-scroller');
        if (!scroller) return false;
        const scrollerRect = scroller.getBoundingClientRect();
        const selections = Array.from(document.querySelectorAll('.cm-selectionBackground'));
        return selections.some((el) => {
          const rect = el.getBoundingClientRect();
          return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
        });
      });
      const beforeCount = await getVisibleSelectionCount(page);
      expect(beforeCount).toBeGreaterThan(0);

      await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller');
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });

      await page.waitForTimeout(100);
      const afterCount = await getVisibleSelectionCount(page);
      expect(afterCount).toBeGreaterThan(0);
    },
    30_000,
  );
});
