import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/useUIStore";
import { getDebugLogPath } from "@/lib/debugLogger";
import { reportOperationError } from "@/lib/reportError";

type EditorTraceWindow = Window & {
  __luminaEditorTrace?: {
    clear?: () => unknown;
    getData?: () => unknown;
  };
};

export function DiagnosticsSection() {
  const diagnosticsEnabled = useUIStore((s) => s.diagnosticsEnabled);
  const setDiagnosticsEnabled = useUIStore((s) => s.setDiagnosticsEnabled);
  const editorInteractionTraceEnabled = useUIStore((s) => s.editorInteractionTraceEnabled);
  const setEditorInteractionTraceEnabled = useUIStore((s) => s.setEditorInteractionTraceEnabled);

  const [logPath, setLogPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [traceBusy, setTraceBusy] = useState(false);
  const title = "Diagnostics";

  useEffect(() => {
    if (!diagnosticsEnabled) return;
    getDebugLogPath()
      .then(setLogPath)
      .catch((error) => {
        reportOperationError({
          source: "DiagnosticsSection",
          action: "Read diagnostics log path",
          error,
          level: "warning",
        });
      });
  }, [diagnosticsEnabled]);

  const exportDiagnostics = async () => {
    try {
      setBusy(true);
      const destination = await save({
        title: "Export Diagnostics",
        defaultPath: `lumina-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      });
      if (!destination || typeof destination !== "string") return;
      await invoke("export_diagnostics", { destination });
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Export diagnostics",
        error: err,
      });
    } finally {
      setBusy(false);
    }
  };

  const clearInteractionTrace = () => {
    try {
      (window as EditorTraceWindow).__luminaEditorTrace?.clear?.();
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Clear interaction trace",
        error: err,
        level: "warning",
      });
    }
  };

  const exportInteractionTrace = async () => {
    try {
      setTraceBusy(true);
      const traceApi = (window as EditorTraceWindow).__luminaEditorTrace;
      const data = traceApi?.getData?.();
      if (!data) {
        throw new Error("Interaction trace is unavailable. Open a note editor and reproduce the issue first.");
      }
      const destination = await save({
        title: "Export Interaction Trace",
        defaultPath: `lumina-editor-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destination || typeof destination !== "string") return;
      await writeTextFile(destination, JSON.stringify(data, null, 2));
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Export interaction trace",
        error: err,
      });
    } finally {
      setTraceBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>

      <div className="flex items-center justify-between py-2 gap-4">
        <div className="min-w-0">
          <p className="font-medium">Collect diagnostics logs</p>
          <p className="text-sm text-muted-foreground">
            When enabled, Lumina writes console logs and crash events to a local file to help debugging.
          </p>
          {diagnosticsEnabled && (
            <p className="text-xs text-muted-foreground truncate mt-1" title={logPath}>
              Log folder: {logPath || "(loading...)"}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Toggle diagnostics logs"
          onClick={() => setDiagnosticsEnabled(!diagnosticsEnabled)}
          className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
            diagnosticsEnabled
              ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
              : "bg-background/60 border-border hover:bg-muted"
          }`}
        >
          {diagnosticsEnabled ? "On" : "Off"}
        </button>
      </div>

      <div className="flex items-center justify-between py-2 gap-4">
        <div className="min-w-0">
          <p className="font-medium">Record editor interaction trace</p>
          <p className="text-sm text-muted-foreground">
            When enabled, Lumina starts a fresh in-memory trace for editor mode switches, scroll moves,
            focus changes, clicks, and selection sync so you can export one repro as JSON.
          </p>
        </div>
        <button
          type="button"
          aria-label="Toggle editor interaction trace"
          onClick={() => setEditorInteractionTraceEnabled(!editorInteractionTraceEnabled)}
          className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
            editorInteractionTraceEnabled
              ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
              : "bg-background/60 border-border hover:bg-muted"
          }`}
        >
          {editorInteractionTraceEnabled ? "Recording" : "Off"}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={exportDiagnostics}
          disabled={!diagnosticsEnabled || busy}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Exporting..." : "Export Diagnostics"}
        </button>
        <button
          type="button"
          aria-label="Clear editor interaction trace"
          onClick={clearInteractionTrace}
          disabled={!editorInteractionTraceEnabled || traceBusy}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear Interaction Trace
        </button>
        <button
          type="button"
          aria-label="Export editor interaction trace"
          onClick={exportInteractionTrace}
          disabled={!editorInteractionTraceEnabled || traceBusy}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {traceBusy ? "Exporting..." : "Export Interaction Trace"}
        </button>
      </div>
    </section>
  );
}
