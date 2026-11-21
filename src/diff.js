export function splitLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export function diffLines(before, after) {
  const original = splitLines(before);
  const proposed = splitLines(after);
  const width = proposed.length + 1;
  const lengths = new Uint16Array((original.length + 1) * width);

  for (let oldIndex = original.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = proposed.length - 1; newIndex >= 0; newIndex--) {
      const offset = oldIndex * width + newIndex;
      lengths[offset] = original[oldIndex] === proposed[newIndex]
        ? 1 + lengths[offset + width + 1]
        : Math.max(lengths[offset + width], lengths[offset + 1]);
    }
  }

  const rows = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < original.length || newIndex < proposed.length) {
    if (oldIndex < original.length && original[oldIndex] === proposed[newIndex]) {
      rows.push({
        kind: "context",
        text: original[oldIndex],
        before: ++oldIndex,
        after: ++newIndex,
      });
      continue;
    }

    const offset = oldIndex * width + newIndex;
    if (oldIndex < original.length && (
      newIndex === proposed.length || lengths[offset + width] >= lengths[offset + 1]
    )) {
      rows.push({ kind: "remove", text: original[oldIndex], before: ++oldIndex, after: null });
    } else {
      rows.push({ kind: "add", text: proposed[newIndex], before: null, after: ++newIndex });
    }
  }

  return rows;
}

export function createGitPatch(edits) {
  const sections = [];
  const signs = { context: " ", remove: "-", add: "+" };

  for (const { path, before, after } of edits) {
    if (before === after) continue;

    const oldLength = splitLines(before).length;
    const newLength = splitLines(after).length;
    const oldStart = oldLength === 0 ? 0 : 1;
    const newStart = newLength === 0 ? 0 : 1;
    const lines = [
      `diff --git a/${path} b/${path}\n`,
      `--- a/${path}\n`,
      `+++ b/${path}\n`,
      `@@ -${oldStart},${oldLength} +${newStart},${newLength} @@\n`,
    ];

    for (const { kind, text } of diffLines(before, after)) {
      lines.push(signs[kind] + text);
      if (!text.endsWith("\n")) lines.push("\n\\ No newline at end of file\n");
    }

    sections.push(lines.join(""));
  }

  return sections.join("");
}
