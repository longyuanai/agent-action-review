# Design

The application uses a static browser interface and a JavaScript review engine. The interface imports workspace and plan JSON, presents file diffs, and downloads the latest Git patch. The engine runs in browser memory.

## Data and control flow

1. A workspace maps exact paths to text and revision counters. The workspace also supplies the writable path set.
2. The plan snapshots each proposed file’s text and revision. Approval records a choice against that snapshot.
3. Preview status derives from path existence, the writable set, revision, and approval state. The interface renders that state separately from the proposed text.
4. Applying a batch checks every selected edit before creating a patch or changing any file. The engine swaps the working-copy map after the batch has been prepared.
5. A line-based longest common subsequence drives both the diff view and unified patch output. Line tokens retain newline bytes so that Git can reproduce the replacement text.

## Verification

Use synthetic text files to exercise scope enforcement. Run the Node tests for stale revisions, rejected imports, and atomic application. Run the Git integration case against a temporary directory. Use the demo to verify the approval and export controls in a browser.
