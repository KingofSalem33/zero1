# Lessons

## 2026-03-11

- Do not claim an audit or verification was run unless the inventory and findings were actually produced.
- If a user asks whether a review happened, answer directly first, then offer to run it.
- When adjusting dense modal/tab layouts, prefer a minimal spacing or label-change pass first; do not switch row structure or tab architecture without validating the visual result.
- When adding a new native UI dependency for mobile, do not assume the current runtime has the native view manager available; add a runtime-safe fallback or verify the target runtime before shipping the render path.
- For map parity work, port the web graph-state pipeline first and only then tune native visuals; if node tap, spotlight, and semantic topic selection drift from web, the map will still feel wrong even when layout and gestures improve.
- When approximating curved edges without SVG, do not rotate segments from their start point; anchor each segment at its midpoint and overlap neighbors slightly, or the connection will read as dashed/broken instead of solid like the web stroke.
- On the map surface, avoid decorative background glows that are not present in the web experience; users read them as graph meaning, not ornament.
- On the map surface, remove instructional or stats cards when they sit over the graph; keep controls, but do not cover exploration space with persistent overlays the web map does not rely on.
- Do not mark modal parity complete just because the native surface has similar actions; compare the actual web modal content blocks, state branches, and supporting logic like topic-title enrichment, verse-chip drill-in, and library metadata editing.
- When the user says "the card from pressing a node," treat that as the semantic connection modal path first, not the plain node detail sheet; parity must follow the web modal's content order and state machine.
- When matching a web modal on mobile, replicate the source-of-truth content hierarchy first (`title`, section labels, list ordering, footer hint, emphasis rules) before polishing styling; the experience still feels wrong if the native sheet uses different information framing.
- For large-screen map parity, keep the breakpoint and row-layout decision in the parent screen, but keep the adaptive inspector component thin; the parent must own available canvas width and centering, while the surface component should only switch between compact sheet and expanded rail shells.
- When a Reader subview swaps a bottom-sheet body from rich content to a smaller tool panel like ROOT, keep the sheet height stable and use the bottom-sheet-native scroll container; otherwise the sheet can collapse toward the bottom and make the final controls hard to reach.
- When an API route has already resolved deterministic Bible/Strong's data, do not let an LLM enrichment failure turn the whole request into a 500; return the resolved data with a clear fallback summary instead.
