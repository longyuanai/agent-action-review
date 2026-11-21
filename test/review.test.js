import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { demoPlan, demoWorkspace } from "../src/demo.js";
import { diffLines } from "../src/diff.js";
import { limits, ReviewSession } from "../src/review.js";

function review(workspace, plan) {
  const session = new ReviewSession(workspace);
  session.loadPlan(plan);
  return session;
}

test("the demo applies and exports only the explicitly approved in-scope edit", () => {
  const session = review(demoWorkspace, demoPlan);
  const originalConfig = session.workingCopy("config/startup.json");
  assert.deepEqual(session.edits.map(edit => edit.status), ["pending", "blocked"]);
  assert.throws(() => session.approve("config/startup.json"), /ineligible/);
  assert.throws(() => session.updateWorkingCopy("config/startup.json", ""), /writable/);
  assert.throws(() => session.applyApproved(), /Approve at least one/);

  session.approve("README.md");
  assert.equal(session.workingCopy("README.md"), demoWorkspace.files[0].content);
  assert.deepEqual(session.applyApproved(), ["README.md"]);
  assert.equal(session.workingCopy("README.md"), demoPlan.edits[0].content);
  assert.equal(session.workingCopy("config/startup.json"), originalConfig);
  assert.match(session.lastPatch, /^diff --git a\/README\.md b\/README\.md/m);
  assert.doesNotMatch(session.lastPatch, /startup\.json/);
  assert.throws(() => session.applyApproved(), /Approve at least one/);
});

test("a changed and restored working copy invalidates the approval for the entire batch", () => {
  const session = review(
    {
      files: [{ path: "a.txt", content: "a\n" }, { path: "b.txt", content: "b\n" }],
      allowedPaths: ["a.txt", "b.txt"],
    },
    { edits: [{ path: "a.txt", content: "A\n" }, { path: "b.txt", content: "B\n" }] },
  );
  session.approve("a.txt");
  session.approve("b.txt");
  session.updateWorkingCopy("a.txt", "An intervening edit\n");
  session.updateWorkingCopy("a.txt", "a\n");
  assert.equal(session.edits[0].status, "stale");
  assert.throws(() => session.applyApproved(), /Review a\.txt again/);
  assert.equal(session.workingCopy("b.txt"), "b\n");
  assert.equal(session.lastPatch, "");

  session.refreshPreview("a.txt");
  assert.equal(session.edits[0].hasApproval, false);
  session.approve("a.txt");
  assert.deepEqual(session.applyApproved(), ["a.txt", "b.txt"]);
});

test("refreshing an edit uses the current copy and discards earlier approval", () => {
  const session = review(demoWorkspace, demoPlan);
  session.approve("README.md");
  session.updateWorkingCopy("README.md", "User notes\n");
  session.refreshPreview("README.md");
  assert.equal(session.edits[0].before, "User notes\n");
  assert.equal(session.edits[0].status, "pending");
  assert.throws(() => session.applyApproved(), /Approve at least one/);
  session.approve("README.md");
  session.revoke("README.md");
  assert.equal(session.edits[0].status, "pending");
});

test("imported plans cannot change workspace scope or create missing files", () => {
  const session = review(JSON.stringify(demoWorkspace), JSON.stringify({
    allowedPaths: ["config/startup.json", "missing.txt"],
    edits: [
      { path: "config/startup.json", content: "unapproved" },
      { path: "missing.txt", content: "unavailable" },
      { path: "readme.md", content: "wrong case" },
    ],
  }));

  assert.deepEqual(session.workspace().allowedPaths, ["README.md"]);
  assert.deepEqual(session.edits.map(edit => edit.status), ["blocked", "blocked", "blocked"]);
});

test("invalid plans preserve the existing plan and its approvals", () => {
  const session = review(demoWorkspace, demoPlan);
  session.approve("README.md");
  for (const path of ["../outside.txt", "/absolute.txt", "C:\\drive.txt", "foo//bar", ".git/config", "x\n", "NUL.txt"]) {
    assert.throws(() => session.loadPlan({ edits: [{ path, content: "x" }] }), /Paths must be relative/);
  }
  assert.throws(() => session.loadPlan("{"), /valid JSON/);
  assert.throws(() => session.loadPlan({
    edits: [{ path: "README.md", content: "a" }, { path: "readme.md", content: "b" }],
  }), /Duplicate path/);
  assert.throws(() => session.loadPlan({
    edits: [{ path: "README.md", content: "a".repeat(limits.characters + 1) }],
  }), /limit/);
  assert.throws(() => session.loadPlan({ edits: [{ path: "README.md", content: "\0" }] }), /UTF-8/);
  assert.equal(session.title, demoPlan.title);
  assert.equal(session.edits[0].status, "approved");
});

test("unchanged files cannot be selected and editing the same content keeps approval", () => {
  const unchanged = review(demoWorkspace, { edits: [demoWorkspace.files[0]] });
  assert.equal(unchanged.edits[0].status, "unchanged");
  assert.throws(() => unchanged.approve("README.md"), /ineligible/);

  const session = review(demoWorkspace, demoPlan);
  session.approve("README.md");
  session.updateWorkingCopy("README.md", demoWorkspace.files[0].content);
  assert.equal(session.edits[0].status, "approved");
});

test("diff rows preserve content on both sides, including final newlines", () => {
  const cases = ["", "\n", "\n\n", "alpha", "alpha\n", "alpha\r\n", "beta\nalpha", "alpha\nbeta\nalpha\n", "你好\n🎃"];
  for (const before of cases) {
    for (const after of cases) {
      const rows = diffLines(before, after);
      assert.equal(rows.filter(row => row.kind !== "add").map(row => row.text).join(""), before);
      assert.equal(rows.filter(row => row.kind !== "remove").map(row => row.text).join(""), after);
    }
  }
});

test("Git applies the exported patch to empty files, CRLF files, and files without a final newline", t => {
  const files = [
    { path: "empty.txt", content: "" },
    { path: "windows.txt", content: "first\r\nsecond\r\n" },
    { path: "no-final-newline.txt", content: "old\nkeep" },
    { path: "cleared.txt", content: "old content\n" },
  ];
  const edits = [
    { path: "empty.txt", content: "new text\n" },
    { path: "windows.txt", content: "first\r\nchanged\r\n" },
    { path: "no-final-newline.txt", content: "new\nkeep" },
    { path: "cleared.txt", content: "" },
  ];
  const workspace = mkdtempSync(join(tmpdir(), "agent-action-review-"));
  const patch = join(workspace, "review.patch");
  t.after(() => {
    for (const { path } of files) rmSync(join(workspace, path), { force: true });
    rmSync(patch, { force: true });
    rmdirSync(workspace);
  });

  for (const { path, content } of files) writeFileSync(join(workspace, path), content, "utf8");
  const session = review({ files, allowedPaths: files.map(file => file.path) }, { edits });
  for (const { path } of edits) session.approve(path);
  session.applyApproved();
  writeFileSync(patch, session.lastPatch, "utf8");

  const gitConfig = ["-c", "core.autocrlf=false", "-c", "core.whitespace=cr-at-eol"];
  execFileSync("git", [...gitConfig, "apply", "--check", patch], { cwd: workspace });
  execFileSync("git", [...gitConfig, "apply", patch], { cwd: workspace });
  for (const { path, content } of edits) assert.equal(readFileSync(join(workspace, path), "utf8"), content);
});
