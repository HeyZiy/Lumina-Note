import { useEffect, useRef, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import {
  getTypesettingPreviewPageMm,
  type TypesettingPreviewPageMm,
} from "@/lib/tauri";
import {
  buildPreviewPageMmFromDocx,
  getDefaultPreviewPageMm,
} from "@/typesetting/previewDefaults";
import {
  buildFallbackFontCandidates,
  buildFamilyFontCandidates,
  normalizeFontFamily,
  osKindFromPlatform,
  type OsKind,
} from "@/typesetting/fontPaths";
import { findFirstExistingFontPath } from "../typesettingUtils";
import type { TypesettingDoc } from "@/stores/useTypesettingDocStore";

export function useTypesettingInit(
  path: string,
  doc: TypesettingDoc | undefined,
  autoOpen: boolean,
  tauriAvailable: boolean,
  openDoc: (path: string) => Promise<void>,
) {
  const [error, setError] = useState<string | null>(null);
  const [pageMm, setPageMm] = useState<TypesettingPreviewPageMm | null>(null);
  const fontPathCache = useRef(new Map<string, string>());
  const osContextRef = useRef<Promise<{ os: OsKind; homeDir?: string }> | null>(null);

  useEffect(() => {
    if (!autoOpen) return;
    if (doc) return;
    openDoc(path).catch((err) => setError(String(err)));
  }, [autoOpen, doc, openDoc, path]);

  useEffect(() => {
    if (doc && error) {
      setError(null);
    }
  }, [doc, error]);

  useEffect(() => {
    let active = true;
    if (doc?.pageStyle) {
      setPageMm(buildPreviewPageMmFromDocx(doc.pageStyle));
      return () => {
        active = false;
      };
    }
    getTypesettingPreviewPageMm()
      .then((data) => {
        if (active) {
          setPageMm(data);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Typesetting preview fallback:", err);
          setPageMm(getDefaultPreviewPageMm());
        }
      });
    return () => {
      active = false;
    };
  }, [doc?.pageStyle]);

  const getOsContext = async (): Promise<{ os: OsKind; homeDir?: string }> => {
    if (!osContextRef.current) {
      osContextRef.current = (async () => {
        let os: OsKind = "unknown";
        try {
          os = osKindFromPlatform(await platform());
        } catch {
          // Ignore platform detection errors.
        }
        if (os === "unknown" && typeof navigator !== "undefined") {
          const ua = navigator.userAgent.toLowerCase();
          if (ua.includes("mac")) os = "macos";
          else if (ua.includes("win")) os = "windows";
          else if (ua.includes("linux")) os = "linux";
        }

        let resolvedHome: string | undefined;
        if (tauriAvailable) {
          try {
            resolvedHome = await homeDir();
          } catch {
            // Ignore home dir errors; fallback paths will skip HOME entries.
          }
        }
        return { os, homeDir: resolvedHome };
      })();
    }
    return osContextRef.current;
  };

  const findFallbackFontPath = async (): Promise<string | null> => {
    const ctx = await getOsContext();
    const candidates = buildFallbackFontCandidates(ctx.os, ctx.homeDir);
    return findFirstExistingFontPath(candidates);
  };

  const resolveFontPath = async (
    family: string | undefined,
    fallbackPath: string,
  ): Promise<string> => {
    if (!tauriAvailable) return fallbackPath;
    if (!family) return fallbackPath;
    const normalized = normalizeFontFamily(family);
    const cached = fontPathCache.current.get(normalized);
    if (cached) {
      return cached;
    }
    const ctx = await getOsContext();
    const candidates = buildFamilyFontCandidates(family, ctx.os, ctx.homeDir);
    const resolved = (await findFirstExistingFontPath(candidates)) ?? fallbackPath;
    fontPathCache.current.set(normalized, resolved);
    return resolved;
  };

  return {
    error,
    pageMm,
    findFallbackFontPath,
    resolveFontPath,
  };
}
