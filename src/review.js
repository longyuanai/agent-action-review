import { createGitPatch, splitLines } from "./diff.js";

export const limits = Object.freeze({
  files: 32,
  edits: 20,
  characters: 64_000,
  lines: 500,
  input: 3_000_000,
});

const invalidPathCharacters = /[^a-z\d._/-]/i;
const deviceName = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;

function readObject(input, description) {
  if (typeof input === "string") {
    if (input.length > limits.input) {
      throw new Error(`${description} exceeds ${limits.input.toLocaleString("en-US")} characters.`);
    }
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error(`${description} needs valid JSON.`);
    }
  }

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${description} must be a JSON object.`);
  }
  return input;
}

function checkPath(path) {
  const validParts = typeof path === "string" && !invalidPathCharacters.test(path)
    && path.split("/").every(part => part && !part.endsWith(".")
      && part.toLowerCase() !== ".git" && !deviceName.test(part));

  if (!validParts || path.length > 240) {
    throw new Error("Paths must be relative and use letters, numbers, dots, hyphens, underscores, and slashes.");
  }
  return path;
}

function checkContent(content, path) {
  if (typeof content !== "string" || /[\0\uD800-\uDFFF]/u.test(content)) {
    throw new Error(`${path} needs UTF-8 text content.`);
  }
  if (content.length > limits.characters || splitLines(content).length > limits.lines) {
    throw new Error(`${path} exceeds the ${limits.characters.toLocaleString("en-US")}-character or ${limits.lines}-line limit.`);
  }
  return content;
}

function readFiles(files, name, limit) {
  if (!Array.isArray(files) || files.length === 0 || files.length > limit) {
    throw new Error(`${name} must contain 1 to ${limit} entries.`);
  }

  const seen = new Set();
  return files.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Each entry in ${name} needs a path and content.`);
    }
    const path = checkPath(item.path);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate path in ${name}: ${path}.`);
    seen.add(key);
    return { path, content: checkContent(item.content, path) };
  });
}

export class ReviewSession {
  #files;
  #allowedPaths;
  #edits = new Map();
  #title = "";
  #lastPatch = "";

  constructor(input) {
    const workspace = readObject(input, "The workspace");
    const files = readFiles(workspace.files, "files", limits.files);
    const knownPaths = new Set(files.map(({ path }) => path));
    if (!Array.isArray(workspace.allowedPaths) || workspace.allowedPaths.length > files.length) {
      throw new Error("Set allowedPaths to an array of workspace file paths.");
    }

    const allowedPaths = workspace.allowedPaths.map(checkPath);
    if (new Set(allowedPaths).size !== allowedPaths.length || allowedPaths.some(path => !knownPaths.has(path))) {
      throw new Error("Each allowed path must name a distinct workspace file exactly.");
    }

    this.#files = new Map(files.map(({ path, content }) => [path, { content, revision: 0 }]));
    this.#allowedPaths = new Set(allowedPaths);
  }

  get title() {
    return this.#title;
  }

  get lastPatch() {
    return this.#lastPatch;
  }

  get edits() {
    return [...this.#edits.values()].map(edit => this.#view(edit));
  }

  workspace() {
    return {
      files: [...this.#files].map(([path, { content }]) => ({ path, content })),
      allowedPaths: [...this.#allowedPaths],
    };
  }

  workingCopy(path) {
    return this.#files.get(path)?.content;
  }

  loadPlan(input) {
    const plan = readObject(input, "The plan");
    const edits = readFiles(plan.edits, "edits", limits.edits);
    const title = typeof plan.title === "string" ? plan.title.replace(/\s+/g, " ").trim() : "";
    if (title.length > 100) throw new Error("The plan title must be 100 characters or fewer.");

    const reviewed = new Map();
    for (const { path, content } of edits) {
      const file = this.#files.get(path);
      reviewed.set(path, {
        path,
        before: file?.content ?? "",
        revision: file?.revision,
        after: content,
        approved: false,
        applied: false,
      });
    }
    this.#edits = reviewed;
    this.#title = title || "Imported plan";
    this.#lastPatch = "";
  }

  approve(path) {
    const edit = this.#requireEdit(path);
    if (this.#view(edit).status !== "pending") throw new Error(`${path} is ineligible for approval.`);
    edit.approved = true;
  }

  revoke(path) {
    this.#requireEdit(path).approved = false;
  }

  updateWorkingCopy(path, content) {
    const file = this.#files.get(path);
    if (!file || !this.#allowedPaths.has(path)) throw new Error("Choose a writable workspace file.");
    checkContent(content, path);
    if (file.content !== content) this.#files.set(path, { content, revision: file.revision + 1 });
  }

  refreshPreview(path) {
    const edit = this.#requireEdit(path);
    if (this.#view(edit).status !== "stale") throw new Error("Choose a stale edit to refresh.");
    const file = this.#files.get(path);
    edit.before = file.content;
    edit.revision = file.revision;
    edit.approved = false;
  }

  applyApproved() {
    const selected = [...this.#edits.values()].filter(edit => edit.approved && !edit.applied);
    if (selected.length === 0) throw new Error("Approve at least one edit before applying.");

    for (const edit of selected) {
      if (this.#view(edit).status !== "approved") {
        throw new Error(`Review ${edit.path} again before applying the selected batch.`);
      }
    }

    const patch = createGitPatch(selected);
    const next = new Map(this.#files);
    for (const edit of selected) {
      next.set(edit.path, { content: edit.after, revision: edit.revision + 1 });
    }
    this.#files = next;
    this.#lastPatch = patch;
    for (const edit of selected) {
      edit.approved = false;
      edit.applied = true;
    }
    return selected.map(({ path }) => path);
  }

  #requireEdit(path) {
    const edit = this.#edits.get(path);
    if (!edit) throw new Error("Choose an edit from the plan.");
    return edit;
  }

  #view(edit) {
    const file = this.#files.get(edit.path);
    const details = {
      path: edit.path,
      before: edit.before,
      after: edit.after,
      hasWorkingCopy: Boolean(file),
      hasApproval: edit.approved,
    };

    if (edit.applied) return { ...details, status: "applied", reason: "Applied to your working copy." };
    if (!file) return { ...details, status: "blocked", reason: "This path is missing from the workspace." };
    if (!this.#allowedPaths.has(edit.path)) {
      return { ...details, status: "blocked", reason: "This path is outside the workspace’s writable scope." };
    }
    if (file.revision !== edit.revision) {
      return { ...details, status: "stale", reason: "The working copy changed. Refresh the preview to review it again." };
    }
    if (edit.before === edit.after) {
      return { ...details, status: "unchanged", reason: "The proposal matches the working copy." };
    }
    return { ...details, status: edit.approved ? "approved" : "pending", reason: "" };
  }
}
