import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ImageManagerViewMode = "grid" | "list" | "group";
export type ImageManagerGroupMode = "status" | "folder";
export type ImageManagerStatusFilter = "all" | "referenced" | "orphan" | "multi" | "recent" | "large";
export type ImageManagerSortBy = "name" | "modified" | "size" | "references";
export type ImageManagerSortOrder = "asc" | "desc";

interface ImageManagerState {
  viewMode: ImageManagerViewMode;
  groupMode: ImageManagerGroupMode;
  statusFilter: ImageManagerStatusFilter;
  folderFilter: string;
  searchQuery: string;
  sortBy: ImageManagerSortBy;
  sortOrder: ImageManagerSortOrder;
  detailPanelOpen: boolean;
  selectedPaths: string[];
  focusedPath: string | null;
  setDetailPanelOpen: (open: boolean) => void;
  setViewMode: (mode: ImageManagerViewMode) => void;
  setGroupMode: (mode: ImageManagerGroupMode) => void;
  setStatusFilter: (filter: ImageManagerStatusFilter) => void;
  setFolderFilter: (folder: string) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sortBy: ImageManagerSortBy) => void;
  setSortOrder: (order: ImageManagerSortOrder) => void;
  setFocusedPath: (path: string | null) => void;
  toggleSelection: (path: string, additive?: boolean) => void;
  replaceSelection: (paths: string[]) => void;
  clearSelection: () => void;
}

const byDefaultSortOrder = (sortBy: ImageManagerSortBy): ImageManagerSortOrder =>
  sortBy === "name" ? "asc" : "desc";

export const useImageManagerStore = create<ImageManagerState>()(
  persist(
    (set) => ({
      viewMode: "grid",
      groupMode: "status",
      statusFilter: "all",
      folderFilter: "all",
      searchQuery: "",
      sortBy: "modified",
      sortOrder: "desc",
      detailPanelOpen: true,
      selectedPaths: [],
      focusedPath: null,
      setDetailPanelOpen: (detailPanelOpen) => set({ detailPanelOpen }),
      setViewMode: (viewMode) => set({ viewMode }),
      setGroupMode: (groupMode) => set({ groupMode }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setFolderFilter: (folderFilter) => set({ folderFilter }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSortBy: (sortBy) =>
        set((state) => ({
          sortBy,
          sortOrder: state.sortBy === sortBy ? state.sortOrder : byDefaultSortOrder(sortBy),
        })),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      setFocusedPath: (focusedPath) => set({ focusedPath }),
      toggleSelection: (path, additive = false) =>
        set((state) => {
          const existing = new Set(state.selectedPaths);
          if (!additive) {
            return {
              selectedPaths: existing.has(path) && state.selectedPaths.length === 1 ? [] : [path],
              focusedPath: path,
            };
          }
          if (existing.has(path)) {
            existing.delete(path);
          } else {
            existing.add(path);
          }
          return {
            selectedPaths: Array.from(existing),
            focusedPath: path,
          };
        }),
      replaceSelection: (paths) =>
        set({
          selectedPaths: paths,
          focusedPath: paths[0] ?? null,
        }),
      clearSelection: () =>
        set({
          selectedPaths: [],
          focusedPath: null,
        }),
    }),
    {
      name: "lumina-image-manager",
      partialize: (state) => ({
        viewMode: state.viewMode,
        groupMode: state.groupMode,
        statusFilter: state.statusFilter,
        folderFilter: state.folderFilter,
        searchQuery: state.searchQuery,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        detailPanelOpen: state.detailPanelOpen,
      }),
    },
  ),
);
