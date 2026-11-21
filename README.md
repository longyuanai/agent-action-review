# Agent Action Review

Agent Action Review brings Git-style diff review to file changes proposed by AI assistants. Load a working copy and a plan, approve changes per file, and export a Git patch.

## Run locally

Use Node.js 20 or later and Git.

```sh
npm start
```

Open `http://127.0.0.1:4173`. The browser app and local server use the standard library.

## Walk through the demo

1. Open `config/startup.json` in the plan. Its diff is visible and the edit is blocked because the workspace permits writes to `README.md`.
2. Open `README.md` and choose **Approve edit**.
3. Choose **Edit working copy**, append a line, then save the copy. **Apply approved** now asks for a fresh review. The working copy retains your edit.
4. Choose **Refresh preview**, review the updated diff, and approve it again. Use **Apply approved**, then **Download patch**. The exported patch includes the approved README edit.
5. Open **Workspace** and choose **Reset demo** for a fresh copy.

## Review your own project

Open **Workspace** and load the existing files and the paths you want the assistant to modify.

```json
{
  "files": [
    { "path": "README.md", "content": "# Notes\n" },
    { "path": "settings.json", "content": "{}\n" }
  ],
  "allowedPaths": ["README.md"]
}
```

Ask your AI assistant to return a JSON plan. Each `content` value contains the complete proposed replacement for one existing file. For example, ask it to propose an update to the README and return JSON shaped like this.

```json
{
  "title": "Clarify setup",
  "edits": [
    { "path": "README.md", "content": "# Notes\n\nRun npm start to preview.\n" }
  ]
}
```

Paste its response into **Import plan**. The workspace controls the writable paths. A changed working copy invalidates approvals based on its earlier revision, and a stale approval prevents the selected batch from applying.

The app reviews existing UTF-8 text files in browser memory. Paths are relative and use ASCII letters, numbers, dots, hyphens, underscores, and forward slashes. A workspace supports up to 32 files, and a plan supports up to 20 edits. Each file can contain up to 64,000 characters and 500 lines. The downloaded patch captures the latest applied batch. Manual edits of the browser copy become part of the base for a new review.

To apply the resulting patch to a real worktree, run these commands from the repository root. The settings below keep the test independent of Git’s automatic line-ending conversion.

```sh
git -c core.autocrlf=false apply --check agent-action-review.patch
git -c core.autocrlf=false apply agent-action-review.patch
```

## Verify

```sh
npm test
```

The test suite covers scope enforcement, stale approvals, atomic application, input validation, diff reconstruction, and patch application with Git.

## Project specification

The [feature specification](.kiro/specs/agent-action-review/requirements.md), [design](.kiro/specs/agent-action-review/design.md), and [tasks](.kiro/specs/agent-action-review/tasks.md) are organized for the Kiro Specs workflow.

## License

[MIT](LICENSE)
