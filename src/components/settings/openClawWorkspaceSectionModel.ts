export function resolveMountedOpenClawWorkspacePath(
  draftPath: string,
  mountedWorkspacePath: string | null,
): string | null {
  const trimmedDraftPath = draftPath.trim();
  if (trimmedDraftPath.length > 0) {
    return trimmedDraftPath;
  }

  const trimmedMountedPath = mountedWorkspacePath?.trim() ?? "";
  return trimmedMountedPath.length > 0 ? trimmedMountedPath : null;
}
