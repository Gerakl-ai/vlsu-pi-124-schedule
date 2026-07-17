export function escapeNoteHtml(value: string) {
  return value.replace(/[&<>"']/g, (symbol) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[symbol] ?? symbol);
}

export function plainTextToHtml(value: string) {
  const paragraphs = value.split(/\r?\n/).map((line) => `<p>${escapeNoteHtml(line) || "<br>"}</p>`);
  return paragraphs.join("") || "<p></p>";
}
