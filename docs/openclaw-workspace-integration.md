# OpenClaw Workspace Integration

This document defines the current Lumina Note integration contract for OpenClaw workspaces.

## Status

Current status: Phase 1 in-product integration is available.

Implemented in Lumina:

- Detect whether the current Lumina workspace matches an OpenClaw workspace contract.
- Allow the user to explicitly attach or detach the current workspace as an OpenClaw workspace.
- Surface key memory files and recent daily memory files inside Lumina.
- Treat OpenClaw memory and artifact files as normal Lumina materials instead of copying them into a separate store.
- Ship a bundled official `OpenClaw Workspace` plugin with overview and quick actions.

Not implemented yet:

- Gateway-backed live controls beyond local file-centric attachment.
- Aggressive conflict resolution beyond normal local file refresh behavior.
- A separate import/sync layer or remote admin workflow.

## Verified Workspace Contract

This integration is intentionally file-first. Lumina works against OpenClaw's workspace files rather than trying to replace OpenClaw runtime, Gateway, or IM-facing surfaces.

Verified references on March 12, 2026:

- [Personal Assistant Setup](https://docs.openclaw.ai/clawd)
- [Default AGENTS.md](https://docs.openclaw.ai/reference/AGENTS.default)
- [FAQ](https://docs.openclaw.ai/start/faq/)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Skills](https://docs.openclaw.ai/skills)

Workspace markers Lumina currently treats as first-class:

- Root files: `AGENTS.md`, `SOUL.md`, `USER.md`
- Additional known root files: `IDENTITY.md`, `TOOLS.md`, `HEARTBEAT.md`, `BOOT.md`, `BOOTSTRAP.md`, `MEMORY.md`
- Known folders: `memory/`, `skills/`, `canvas/`, `output/`
- Daily memory pattern: `memory/YYYY-MM-DD.md`

Local verification used during implementation:

- A live local OpenClaw workspace existed at `~/.openclaw/workspace`
- Observed root files included `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md`
- Observed folders included `memory/`, `skills/`, and `output/`

## Product Contract

Lumina currently supports one explicit integration model:

- Open the real OpenClaw workspace folder as the current Lumina workspace.
- Optionally attach that current workspace as an OpenClaw workspace.

Behavioral rules:

- Detection is automatic when Lumina loads or refreshes the file tree.
- Attachment is explicit and user-controlled.
- Editing in Lumina changes the same files OpenClaw reads and writes.
- Lumina does not create a second storage format for OpenClaw materials.
- Search, graph, markdown editing, retrieval, and project organization operate on the same workspace files.

## Security And Support Boundaries

Lumina is not the OpenClaw execution engine.

Out of scope for this integration:

- Replacing OpenClaw Gateway
- Replacing OpenClaw sandboxing
- Rebuilding OpenClaw's chat or IM trigger surfaces inside Lumina
- Managing OpenClaw credentials or Gateway auth flows

Important user-facing boundary:

- If a file is edited in Lumina, that edit is written to the real workspace on disk.
- If OpenClaw edits the same file nearby in time, Lumina follows normal local file refresh behavior; it does not provide CRDT merge or distributed conflict resolution.

## Failure Boundaries

Expected failure modes:

- The current workspace is not an OpenClaw workspace.
- The workspace path becomes unavailable or is moved.
- Required root markers disappear after attachment.
- OpenClaw writes new files that Lumina has not refreshed yet.

Current handling:

- Lumina keeps detection state per workspace path.
- Attachment can be cleared manually.
- Missing markers degrade the integration affordances instead of blocking normal file browsing.
- Workspace refresh updates recent memory and artifact affordances when the file tree is reloaded.

## Validation Checklist

Completed validation for the current implementation:

- Unit tests for workspace detection and derived memory/artifact metadata
- Unit tests for persisted OpenClaw workspace store behavior
- Unit tests for built-in plugin enablement defaults
- TypeScript compile check with `npx tsc --noEmit`
- Production web build with `npm run build`

Recommended manual checks before broader rollout:

- Open a real `~/.openclaw/workspace` in Lumina
- Confirm the settings panel shows detected markers and attachment status
- Attach the workspace and verify the bundled plugin overview opens
- Open `AGENTS.md` and a recent `memory/YYYY-MM-DD.md` from Sidebar and Overview
- Refresh after creating a new file under `output/` or `canvas/`
- Rename or remove the workspace path and confirm Lumina degrades safely

## Next Steps

Planned follow-up work:

- Stronger grouping for memories, plans, and artifacts
- Saved searches or filtered workspace views for OpenClaw outputs
- Better conflict visibility when files change during an open Lumina session
- Optional Gateway-aware enhancements after the file-centric path is stable
