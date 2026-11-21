import { diffLines } from "./diff.js";
import { demoPlan, demoWorkspace } from "./demo.js";
import { limits, ReviewSession } from "./review.js";

const byId = id => document.getElementById(id);
const editList = byId("edit-list");
const diffBody = byId("diff-lines");
const scopeList = byId("scope-list");
const feedback = byId("feedback");
const labels = {
  pending: "Needs review",
  blocked: "Blocked",
  approved: "Approved",
  stale: "Review again",
  applied: "Applied",
  unchanged: "Unchanged",
};

let session;
let selectedPath;
let workingCopyPath;
let originalCopy;

function loadDemo() {
  const next = new ReviewSession(demoWorkspace);
  next.loadPlan(demoPlan);
  session = next;
  selectedPath = demoPlan.edits[0].path;
}

function message(text, error = false) {
  feedback.textContent = text;
  feedback.classList.toggle("error", error);
  feedback.hidden = !text;
}

function makeBadge(status) {
  const element = document.createElement("span");
  element.className = `badge ${status}`;
  element.textContent = labels[status];
  return element;
}

function makePlanRow(edit) {
  const row = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-button";
  button.setAttribute("aria-pressed", String(edit.path === selectedPath));
  const path = document.createElement("span");
  path.className = "path";
  path.textContent = edit.path;
  button.append(path, makeBadge(edit.status));
  button.addEventListener("click", () => {
    selectedPath = edit.path;
    message("");
    render();
    byId("diff-scroll").scrollTo(0, 0);
    editList.querySelector('button[aria-pressed="true"]')?.focus();
  });
  row.append(button);
  return row;
}

function renderDiff(edit) {
  const rows = diffLines(edit.before, edit.after);
  const signs = { context: "", remove: "−", add: "+" };
  let additions = 0;
  let removals = 0;
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const line = document.createElement("tr");
    line.className = row.kind;
    if (row.kind === "add") additions++;
    if (row.kind === "remove") removals++;
    for (const [index, value] of [row.before, row.after, signs[row.kind], row.text].entries()) {
      const cell = document.createElement("td");
      cell.textContent = index === 3 ? value.replace(/\r?\n$/, "") : value ?? "";
      if (index === 2) cell.className = "sign";
      if (index === 3) cell.className = "line-text";
      line.append(cell);
    }
    fragment.append(line);
  }

  diffBody.replaceChildren(fragment);
  byId("diff-summary").textContent = `${additions} added · ${removals} removed`;
}

function render() {
  const edits = session.edits;
  const current = edits.find(edit => edit.path === selectedPath);
  const approved = edits.filter(edit => edit.hasApproval).length;
  const blocked = edits.filter(edit => edit.status === "blocked").length;
  byId("plan-title").textContent = session.title || "No plan loaded";
  byId("plan-summary").textContent = `${edits.length} proposed · ${blocked} blocked`;
  byId("download-patch").disabled = !session.lastPatch;
  byId("apply-edits").disabled = approved === 0;
  byId("apply-edits").textContent = approved ? `Apply approved (${approved})` : "Apply approved";
  editList.replaceChildren(...edits.map(makePlanRow));
  const scope = session.workspace().allowedPaths;
  scopeList.replaceChildren(...(scope.length ? scope : ["No writable paths"]).map(path => {
    const item = document.createElement("li");
    item.textContent = path;
    return item;
  }));

  byId("empty-review").hidden = Boolean(current);
  byId("active-review").hidden = !current;
  if (!current) return;

  byId("file-name").textContent = current.path;
  byId("file-status").className = `badge ${current.status}`;
  byId("file-status").textContent = labels[current.status];
  byId("file-notice").className = `notice ${current.status}`;
  byId("file-notice").textContent = current.reason;
  byId("file-notice").hidden = !current.reason;
  byId("edit-copy").hidden = !current.hasWorkingCopy || current.status === "blocked";
  byId("refresh-preview").hidden = current.status !== "stale";
  byId("approve-edit").hidden = current.status !== "pending" && !current.hasApproval;
  byId("approve-edit").textContent = current.hasApproval ? "Revoke approval" : "Approve edit";
  renderDiff(current);
}

function act(callback) {
  try {
    message(callback());
    render();
  } catch (error) {
    message(error.message, true);
  }
}

byId("approve-edit").addEventListener("click", () => act(() => {
  const edit = session.edits.find(item => item.path === selectedPath);
  if (edit.hasApproval) {
    session.revoke(selectedPath);
    return `Revoked approval for ${selectedPath}.`;
  }
  session.approve(selectedPath);
  return `Approved ${selectedPath}.`;
}));

byId("refresh-preview").addEventListener("click", () => act(() => {
  session.refreshPreview(selectedPath);
  return "Preview refreshed. Review the new diff and approve it again.";
}));

byId("apply-edits").addEventListener("click", () => act(() => {
  const applied = session.applyApproved();
  const files = applied.length === 1 ? "file" : "files";
  return `Applied ${applied.length} ${files}. Your Git patch is ready to download.`;
}));

byId("download-patch").addEventListener("click", () => {
  if (!session.lastPatch) return;
  const blob = new Blob([session.lastPatch], { type: "text/x-diff;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "agent-action-review.patch";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function configureDialog({ id, opener, inputId, initial, save, limit }) {
  const dialog = byId(`${id}-dialog`);
  const form = byId(`${id}-form`);
  const input = byId(inputId);
  const errorBox = byId(`${id}-error`);
  input.maxLength = limit;
  byId(opener).addEventListener("click", () => {
    errorBox.hidden = true;
    input.value = initial();
    dialog.showModal();
  });
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      const result = save(input.value);
      dialog.close();
      message(result);
      render();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });
}

configureDialog({
  id: "workspace",
  opener: "open-workspace",
  inputId: "workspace-json",
  limit: limits.input,
  initial: () => JSON.stringify(session.workspace(), null, 2),
  save: input => {
    session = new ReviewSession(input);
    selectedPath = undefined;
    return "Workspace loaded. Import an edit plan to continue.";
  },
});

configureDialog({
  id: "plan",
  opener: "open-plan",
  inputId: "plan-json",
  limit: limits.input,
  initial: () => JSON.stringify(demoPlan, null, 2),
  save: input => {
    session.loadPlan(input);
    const edits = session.edits;
    selectedPath = (edits.find(edit => edit.status === "pending") ?? edits[0]).path;
    return "Plan loaded. Review each change before applying.";
  },
});

configureDialog({
  id: "copy",
  opener: "edit-copy",
  inputId: "copy-content",
  limit: limits.characters,
  initial: () => {
    workingCopyPath = selectedPath;
    byId("copy-label").textContent = workingCopyPath;
    originalCopy = session.workingCopy(workingCopyPath);
    return originalCopy;
  },
  save: input => {
    if (input === originalCopy.replace(/\r\n?/g, "\n")) return "Working copy is unchanged.";
    const usesCrLf = originalCopy.includes("\r\n") && !/(?<!\r)\n|\r(?!\n)/.test(originalCopy);
    session.updateWorkingCopy(workingCopyPath, usesCrLf ? input.replace(/\n/g, "\r\n") : input);
    return `Saved the working copy of ${workingCopyPath}.`;
  },
});

byId("reset-demo").addEventListener("click", () => {
  loadDemo();
  byId("workspace-dialog").close();
  message("Demo workspace loaded.");
  render();
});

loadDemo();
render();
