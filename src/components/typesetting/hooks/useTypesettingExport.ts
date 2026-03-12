import { useCallback, useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, remove } from "@tauri-apps/plugin-fs";
import { join, tempDir } from "@tauri-apps/api/path";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  getTypesettingExportPdfBase64,
  getTypesettingRenderDocxPdfBase64,
  getDocToolsStatus,
  installDocTools,
  type TypesettingPreviewBoxMm,
  type TypesettingPreviewPageMm,
} from "@/lib/tauri";
import { decodeBase64ToBytes } from "@/typesetting/base64";
import type { TypesettingDoc } from "@/stores/useTypesettingDocStore";
import {
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_LINE_HEIGHT_PX,
  type LayoutRender,
  type RenderedLine,
  mmToPx,
  pxToMm,
  pxToPt,
} from "../typesettingUtils";

interface UseTypesettingExportOptions {
  path: string;
  doc: TypesettingDoc | undefined;
  pageMm: TypesettingPreviewPageMm | null;
  bodyLayout: LayoutRender | null;
  bodyLines: RenderedLine[];
  bodyLineStyles: Array<{ fontSizePx: number; lineHeightPx: number; underline: boolean }>;
  headerLayout: LayoutRender | null;
  headerLines: RenderedLine[];
  footerLayout: LayoutRender | null;
  footerLines: RenderedLine[];
  bodyPageHeightPx: number | null;
  bodyUsesEngine: boolean;
  totalPages: number;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  currentPage: number;
  setCurrentPage: (v: number | ((prev: number) => number)) => void;
  editableRef: React.RefObject<HTMLDivElement | null>;
  pageRef: React.RefObject<HTMLDivElement | null>;
  tauriAvailable: boolean;
  exportDocx: (path: string, outputPath: string) => Promise<void>;
  onExportReady?: ((fn: (() => Promise<Uint8Array>) | null) => void) | null;
  pageMounted: boolean;
}

export function useTypesettingExport({
  path,
  doc,
  pageMm,
  bodyLayout,
  bodyLines,
  bodyLineStyles: _bodyLineStyles,
  headerLayout,
  headerLines,
  footerLayout,
  footerLines,
  bodyPageHeightPx,
  bodyUsesEngine,
  totalPages,
  isEditing,
  setIsEditing,
  currentPage,
  setCurrentPage,
  editableRef,
  pageRef,
  tauriAvailable,
  exportDocx,
  onExportReady,
  pageMounted,
}: UseTypesettingExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportDocxError, setExportDocxError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [openOfficePreview, setOpenOfficePreview] = useState(false);
  const [openOfficePdf, setOpenOfficePdf] = useState<Uint8Array | null>(null);
  const [openOfficeError, setOpenOfficeError] = useState<string | null>(null);
  const [openOfficeLoading, setOpenOfficeLoading] = useState(false);
  const [openOfficeTotalPages, setOpenOfficeTotalPages] = useState(0);
  const [openOfficeStale, setOpenOfficeStale] = useState(false);
  const [openOfficeAutoRefresh, setOpenOfficeAutoRefresh] = useState(false);
  const openOfficeRefreshRef = useRef<number | null>(null);
  const [docToolsInstalling, setDocToolsInstalling] = useState(false);

  const exportReady = Boolean(pageMm && pageMounted);

  const waitForNextPaint = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

  const renderPagesToPdfBytes = useCallback(async (): Promise<Uint8Array | null> => {
    if (!pageMm) return null;
    if (isEditing) {
      editableRef.current?.blur();
      setIsEditing(false);
      await waitForNextPaint();
    }
    const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
      import("jspdf"),
      bodyUsesEngine ? Promise.resolve(null) : import("html2canvas"),
    ]);
    const pageWidthMm = pageMm.page.width_mm;
    const pageHeightMm = pageMm.page.height_mm;
    const orientation = pageWidthMm > pageHeightMm ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: [pageWidthMm, pageHeightMm],
      compress: true,
    });
    const fontAsset = typeof window !== "undefined" ? window.__luminaTypesettingFont : undefined;
    if (fontAsset?.data) {
      try {
        pdf.addFileToVFS(fontAsset.fileName, fontAsset.data);
        pdf.addFont(fontAsset.fileName, fontAsset.name, "normal");
        pdf.setFont(fontAsset.name, "normal");
      } catch {
        // Keep default font if custom font fails to load.
      }
    }
    const bodyHeightPx = bodyPageHeightPx ?? mmToPx(pageMm.body.height_mm);

    const drawLines = (
      lines: RenderedLine[],
      offsetMm: TypesettingPreviewBoxMm,
      fallbackFontSizePx: number,
    ) => {
      for (const line of lines) {
        const fontSizePx = line.fontSizePx ?? fallbackFontSizePx;
        const xMm = offsetMm.x_mm + pxToMm(line.x);
        const yMm = offsetMm.y_mm + pxToMm(line.y);
        pdf.setFontSize(pxToPt(fontSizePx));
        pdf.text(line.text, xMm, yMm, { baseline: "top" });
        if (line.underline) {
          const underlineY = yMm + pxToMm(fontSizePx * 0.9);
          const underlineWidth = pxToMm(line.width);
          pdf.setLineWidth(0.2);
          pdf.line(xMm, underlineY, xMm + underlineWidth, underlineY);
        }
      }
    };

    if (bodyUsesEngine) {
      const fallbackFontSizePx = bodyLayout?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
      const headerFontSizePx = headerLayout?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
      const footerFontSizePx = footerLayout?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1) {
          pdf.addPage();
        }
        const pageStart = (page - 1) * bodyHeightPx;
        const pageEnd = pageStart + bodyHeightPx;
        const pageBodyLines = bodyLines
          .filter((line) => {
            const lineHeight = line.lineHeightPx ?? bodyLayout?.lineHeightPx ?? DEFAULT_LINE_HEIGHT_PX;
            return line.y + lineHeight > pageStart && line.y < pageEnd;
          })
          .map((line) => ({
            ...line,
            y: line.y - pageStart,
          }));
        drawLines(pageBodyLines, pageMm.body, fallbackFontSizePx);
        if (headerLines.length > 0) {
          drawLines(headerLines, pageMm.header, headerFontSizePx);
        }
        if (footerLines.length > 0) {
          drawLines(footerLines, pageMm.footer, footerFontSizePx);
        }
      }
      return new Uint8Array(pdf.output("arraybuffer"));
    }

    if (!pageRef.current || !html2canvasModule) return null;
    const html2canvas = html2canvasModule.default;
    const originalPage = currentPage;
    const originalScrollTop = editableRef.current?.scrollTop ?? 0;
    for (let page = 1; page <= totalPages; page += 1) {
      if (!pageRef.current) break;
      if (page !== currentPage) {
        setCurrentPage(page);
        await waitForNextPaint();
      }
      if (!bodyUsesEngine && editableRef.current && bodyHeightPx > 0) {
        editableRef.current.scrollTop = (page - 1) * bodyHeightPx;
        await waitForNextPaint();
      }
      const canvas = await html2canvas(pageRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      if (page > 1) {
        pdf.addPage();
      }
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidthMm, pageHeightMm);
    }
    if (!bodyUsesEngine && editableRef.current) {
      editableRef.current.scrollTop = originalScrollTop;
      await waitForNextPaint();
    }
    if (originalPage !== currentPage) {
      setCurrentPage(originalPage);
      await waitForNextPaint();
    }
    return new Uint8Array(pdf.output("arraybuffer"));
  }, [
    bodyLayout,
    bodyLines,
    bodyPageHeightPx,
    bodyUsesEngine,
    currentPage,
    editableRef,
    footerLayout,
    footerLines,
    headerLayout,
    headerLines,
    isEditing,
    pageMm,
    pageRef,
    setCurrentPage,
    setIsEditing,
    totalPages,
  ]);

  const ensureOpenOfficeAvailable = useCallback(async (): Promise<boolean> => {
    if (!tauriAvailable) {
      setOpenOfficeError("OpenOffice preview requires desktop app.");
      return false;
    }
    try {
      const status = await getDocToolsStatus();
      const soffice = status.tools?.soffice;
      if (!soffice?.available) {
        setOpenOfficeError("soffice not available. Install doc tools.");
        return false;
      }
      return true;
    } catch (err) {
      setOpenOfficeError(String(err));
      return false;
    }
  }, [tauriAvailable]);

  const renderOpenOfficePdfBytes = useCallback(async (): Promise<Uint8Array | null> => {
    const available = await ensureOpenOfficeAvailable();
    if (!available) return null;
    if (!doc) {
      setOpenOfficeError("OpenOffice preview requires a document.");
      return null;
    }
    setOpenOfficeError(null);
    setOpenOfficeLoading(true);
    let tempDocxPath: string | null = null;
    try {
      const tempRoot = await tempDir();
      const docxPath = await join(
        tempRoot,
        `lumina-openoffice-${Date.now()}.docx`,
      );
      tempDocxPath = docxPath;
      await exportDocx(path, docxPath);
      const payload = await getTypesettingRenderDocxPdfBase64(docxPath);
      const bytes = decodeBase64ToBytes(payload);
      setOpenOfficePdf(bytes);
      setOpenOfficeStale(false);
      return bytes;
    } catch (err) {
      const reason = String(err);
      setOpenOfficeError(reason);
      return null;
    } finally {
      if (tempDocxPath) {
        try {
          await remove(tempDocxPath);
        } catch {
          // ignore cleanup errors
        }
      }
      setOpenOfficeLoading(false);
    }
  }, [doc, ensureOpenOfficeAvailable, exportDocx, path]);

  const getExportPdfBytes = useCallback(async (): Promise<Uint8Array> => {
    if (openOfficePreview) {
      const openOffice = openOfficePdf ?? await renderOpenOfficePdfBytes();
      if (openOffice) {
        return openOffice;
      }
    }
    const rendered = await renderPagesToPdfBytes();
    if (rendered) return rendered;
    const payload = await getTypesettingExportPdfBase64();
    return decodeBase64ToBytes(payload);
  }, [openOfficePdf, openOfficePreview, renderOpenOfficePdfBytes, renderPagesToPdfBytes]);

  const handleToggleOpenOfficePreview = async () => {
    if (openOfficePreview) {
      setOpenOfficePreview(false);
      setOpenOfficeTotalPages(0);
      return;
    }
    setOpenOfficePreview(true);
    if (!openOfficePdf || openOfficeStale) {
      await renderOpenOfficePdfBytes();
    }
  };

  const handleRefreshOpenOfficePreview = async () => {
    setOpenOfficePreview(true);
    await renderOpenOfficePdfBytes();
  };

  const handleInstallDocTools = async () => {
    if (!tauriAvailable) return;
    setDocToolsInstalling(true);
    try {
      await installDocTools();
      setOpenOfficeError(null);
      if (openOfficePreview) {
        await renderOpenOfficePdfBytes();
      }
    } catch (err) {
      setOpenOfficeError(String(err));
    } finally {
      setDocToolsInstalling(false);
    }
  };

  // Reset OpenOffice state on path/settings change
  useEffect(() => {
    setOpenOfficePdf(null);
    setOpenOfficeTotalPages(0);
    setOpenOfficeError(null);
    setOpenOfficeStale(false);
    if (openOfficePreview && openOfficeAutoRefresh) {
      renderOpenOfficePdfBytes().catch(() => null);
    }
  }, [openOfficeAutoRefresh, openOfficePreview, path, renderOpenOfficePdfBytes]);

  // Auto-refresh OpenOffice preview after editing
  const scheduleOpenOfficeRefresh = useCallback(() => {
    if (!openOfficePreview || !openOfficeAutoRefresh) return;
    if (openOfficeLoading) return;
    if (!doc?.isDirty) return;
    if (isEditing) return;

    setOpenOfficeStale(true);
    if (openOfficeRefreshRef.current) {
      clearTimeout(openOfficeRefreshRef.current);
    }
    openOfficeRefreshRef.current = window.setTimeout(() => {
      renderOpenOfficePdfBytes().catch(() => null);
    }, 1200);
  }, [
    doc?.isDirty,
    isEditing,
    openOfficeAutoRefresh,
    openOfficeLoading,
    openOfficePreview,
    renderOpenOfficePdfBytes,
  ]);

  useEffect(() => {
    scheduleOpenOfficeRefresh();
    return () => {
      if (openOfficeRefreshRef.current) {
        clearTimeout(openOfficeRefreshRef.current);
      }
    };
  }, [doc?.lastOp, doc?.isDirty, scheduleOpenOfficeRefresh]);

  // Notify parent of export readiness
  useEffect(() => {
    if (!onExportReady) return;
    if (!exportReady) {
      onExportReady(null);
      return;
    }
    onExportReady(getExportPdfBytes);
    return () => {
      onExportReady(null);
    };
  }, [exportReady, getExportPdfBytes, onExportReady]);

  // Mark OpenOffice stale when document changes
  useEffect(() => {
    if (!openOfficePreview) return;
    if (doc?.isDirty) {
      setOpenOfficeStale(true);
    }
  }, [doc?.isDirty, openOfficePreview]);

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const filePath = await save({
        defaultPath: "typesetting-export.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!filePath) return;
      const bytes = await getExportPdfBytes();
      await writeFile(filePath, bytes);
    } catch (err) {
      console.error("Typesetting PDF export failed:", err);
      setExportError("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportDocx = async () => {
    setExportDocxError(null);
    setExportingDocx(true);
    try {
      const defaultPath = doc?.path
        ? doc.path.replace(/\.docx$/i, "-export.docx")
        : "typesetting-export.docx";
      const filePath = await save({
        defaultPath,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });
      if (!filePath) return;
      await exportDocx(path, filePath);
    } catch (err) {
      console.error("Typesetting DOCX export failed:", err);
      setExportDocxError("Export failed.");
    } finally {
      setExportingDocx(false);
    }
  };

  const handlePrint = async () => {
    setPrintError(null);
    setPrinting(true);
    try {
      const tempRoot = await tempDir();
      const filePath = await join(
        tempRoot,
        `lumina-typesetting-print-${Date.now()}.pdf`,
      );
      const bytes = await getExportPdfBytes();
      await writeFile(filePath, bytes);
      await openExternal(filePath);
    } catch (err) {
      console.error("Typesetting print failed:", err);
      setPrintError("Print failed.");
    } finally {
      setPrinting(false);
    }
  };

  return {
    // Export state
    exporting,
    exportError,
    exportingDocx,
    exportDocxError,
    printing,
    printError,
    // OpenOffice state
    openOfficePreview,
    openOfficePdf,
    openOfficeError,
    openOfficeLoading,
    openOfficeTotalPages,
    setOpenOfficeTotalPages,
    openOfficeStale,
    openOfficeAutoRefresh,
    setOpenOfficeAutoRefresh,
    docToolsInstalling,
    // Handlers
    handleExport,
    handleExportDocx,
    handlePrint,
    handleToggleOpenOfficePreview,
    handleRefreshOpenOfficePreview,
    handleInstallDocTools,
  };
}
