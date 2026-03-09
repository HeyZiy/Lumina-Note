import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const isMacByNavigator = (): boolean =>
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function useMacTopChromeEnabled(): boolean {
  const tauriRuntime = isTauri();
  const [enabled, setEnabled] = useState(() => tauriRuntime && isMacByNavigator());

  useEffect(() => {
    let disposed = false;

    if (!tauriRuntime) {
      setEnabled(false);
      return;
    }

    const syncPlatform = () => {
      try {
        const os = platform();
        if (!disposed) setEnabled(os === "macos");
      } catch (error) {
        console.warn("Failed to detect platform for MacTopChrome:", error);
        if (!disposed) setEnabled(isMacByNavigator());
      }
    };

    syncPlatform();
    return () => {
      disposed = true;
    };
  }, [tauriRuntime]);

  return enabled;
}

interface MacTopChromeProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function MacTopChrome({ title, subtitle, actions, className }: MacTopChromeProps) {
  const enabled = useMacTopChromeEnabled();

  if (!enabled) return null;

  return (
    <header
      className={cn(
        "h-12 shrink-0 flex items-center gap-3 px-3 bg-background/72 supports-[backdrop-filter]:bg-background/60",
        "backdrop-blur-xl text-sm text-muted-foreground select-none",
        className,
      )}
      data-tauri-drag-region
      data-testid="mac-top-chrome"
    >
      <div className="w-[88px] shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">{title}</div>
          {subtitle ? <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-1.5"
        data-tauri-drag-region="false"
        data-testid="mac-top-chrome-actions"
      >
        {actions}
      </div>
    </header>
  );
}
