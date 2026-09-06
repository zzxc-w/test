# Collaboration

For non-trivial work in this repository, use multi-agent collaboration whenever the task has independent, bounded pieces that can safely run in parallel. Typical splits include gameplay systems, UI/visual work, testing/QA, and deployment research. Keep one agent responsible for integrating and verifying changes; do not delegate overlapping edits to the same files.

Do not use additional agents for trivial one-file edits or tasks that cannot benefit from parallel work.

# Project continuity

Read `PROJECT_STATE.md` when beginning work if the previous task context is incomplete. Keep it concise and update it after significant milestones or architectural/design decisions; record the current state and rationale, not a full development log.

Before trusting potentially stale continuity notes, verify them against the actual repository, current code, `git status`, and `git diff`. Fetch or pull the latest branch and re-read the current file before editing it. Preserve concurrent collaborator changes, and never overwrite them with an older local or remembered version.
