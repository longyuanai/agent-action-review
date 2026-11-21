# Requirements

## 1. Import a workspace and an edit plan

As a developer, I want to bring changes proposed by an AI assistant into a separate review session.

1. When the developer loads valid workspace JSON, the system shall record the existing text files and the explicitly writable paths.
2. When the developer imports a valid plan, the system shall preview each proposed replacement against the current working copy.
3. When an import fails validation, the system shall keep the current workspace, plan, and approvals intact.

## 2. Review and approve each file

As a developer, I want to see the exact proposed changes and control which ones can be applied.

1. When a proposed path falls outside the writable scope or is missing, the system shall show why the edit is blocked and prevent approval.
2. When the developer approves one eligible edit, the system shall leave the working copy unchanged until the developer applies the approved batch.
3. When a working-copy revision changes, the system shall require a refreshed preview and new approval for that file.
4. If any selected approval is stale, the system shall leave the entire batch unapplied.

## 3. Apply and export the approved batch

As a developer, I want a Git patch corresponding to the edits that actually passed review.

1. When the developer applies a valid batch, the system shall change only the approved files in the browser working copy.
2. When the developer downloads the patch, it shall contain exactly the latest successfully applied batch.
3. When Git applies that patch to matching base content, it shall reproduce the approved replacement text.
