import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  Bot,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Shapes,
} from "lucide-react";

interface SidebarHeaderProps {
  isAIMainActive: boolean;
  onNewFile: () => void;
  onNewDiagram: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  isLoadingTree: boolean;
  onMoreMenu: (pos: { x: number; y: number }) => void;
}

export function SidebarHeader({
  isAIMainActive,
  onNewFile,
  onNewDiagram,
  onNewFolder,
  onRefresh,
  isLoadingTree,
  onMoreMenu,
}: SidebarHeaderProps) {
  const { t } = useLocaleStore();
  const setRightPanelTab = useUIStore((s) => s.setRightPanelTab);

  return (
    <div className="p-3 flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase">
      <span className="ui-compact-text ui-compact-hide-md">{t.sidebar.files}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            useFileStore.getState().openAIMainTab();
            setRightPanelTab("outline");
          }}
          className={cn(
            "w-7 h-7 ui-icon-btn",
            isAIMainActive
              ? "bg-primary/10 text-primary border border-primary/15 hover:bg-primary/12"
              : ""
          )}
          title={t.ai.chat}
        >
          <Bot className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewFile}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newNote}
        >
          <FilePlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewDiagram}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newDiagram}
        >
          <Shapes className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewFolder}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newFolder}
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoadingTree}
          className="w-7 h-7 ui-icon-btn disabled:opacity-50 disabled:pointer-events-none"
          title={t.sidebar.refresh}
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isLoadingTree && "animate-spin")}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoreMenu({ x: e.clientX, y: e.clientY + 20 });
          }}
          className="w-7 h-7 ui-icon-btn"
          title={t.common.settings}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
