# Local execution boundary

- In local Codex conversations, use the local workspace, shell, and computer tools available to that Codex session. Do not call the Luke Desktop MCP app or any `luke_desktop_mcp_*` tool.
- Use the Luke Desktop MCP app only in standard ChatGPT Chat or in ChatGPT Work tasks explicitly running on a cloud PC. Do not use it in Codex, local Work, or any other local execution context.
- For local browser and UI tasks, use the local browser/computer tools available to the current local session.

# UI changes

- For any UI work in this repository, read and apply `C:/Users/luker/.codex/skills/ui-layout-quality/SKILL.md` before editing. It covers spacing ownership, dialog alignment, and rendered visual checks at normal and minimum window sizes.
- Also read and apply `C:/Users/luker/.codex/skills/impeccable/SKILL.md` for UI planning, creation, refinement, and review. Use its task-appropriate references; for JSM Studio application screens, use its **Operate** guidance to prioritize familiar controls, scanability, consistency, and restraint.
- Use progressive disclosure for advanced or infrequent options, meaningful groups, clear action hierarchy, and descriptive labels. Keep common actions discoverable and preserve access to all necessary settings. Reuse the existing components and design tokens, and preserve controller/keyboard navigation and interaction state.
- Before completing UI changes, read and apply `C:/Users/luker/.codex/skills/web-design-guidelines/SKILL.md` to the changed UI files. Fetch its current upstream guidelines as instructed, check applicable rules, and fix issues introduced by the change. The changed files are the review target; do not ask the user to name them again. Report any unavailable checks or remaining issues accurately.
- Apply both design skills alongside `ui-layout-quality`, including rendered checks at normal and minimum supported window sizes. Treat web-specific recommendations in the context of this controller-first Tauri application; explicit user requirements and repository behavior take priority over generic style suggestions.
- The skills are installed globally. Resolve Impeccable's relative references and scripts against `C:/Users/luker/.codex/skills/impeccable`, and run its Windows launcher at `C:/Users/luker/.codex/skills/impeccable/scripts/impeccable.cmd` with the repository as the working directory. Do not assume a project-local `.agents/skills/impeccable` copy exists.
