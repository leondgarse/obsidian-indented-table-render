const { Plugin, MarkdownRenderer, MarkdownRenderChild, editorInfoField, editorLivePreviewField } = require("obsidian");
const { StateField } = require("@codemirror/state");
const { Decoration, EditorView, WidgetType } = require("@codemirror/view");

const LIST_RE = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/;
const DELIM_CELL_RE = /^:?-+:?$/;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

function columns(ws) {
  let col = 0;
  for (const ch of ws) col = ch === "\t" ? col + 4 - (col % 4) : col + 1;
  return col;
}

// Cells of a pipe table row, or null if the text has no unescaped pipe
function splitRow(text) {
  let s = text.trim();
  if (!/(^|[^\\])\|/.test(s)) return null;
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

// Row text after the table indent, or null if the line has a different indent
function rowText(line, indent) {
  if (!line.startsWith(indent)) return null;
  const rest = line.slice(indent.length);
  return /^[ \t]/.test(rest) || !rest ? null : rest;
}

// Indented pipe tables as 0-based { start, end, indent, nested } line ranges.
// nested: the table sits under a list item; otherwise it is indented under a heading or paragraph.
function findTables(lines) {
  const tables = [];
  let fence = null;
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }
  for (; i < lines.length - 1; i++) {
    const line = lines[i];
    const f = line.match(FENCE_RE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length)) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const m = line.match(/^([ \t]+)\S/);
    if (!m) continue;
    const indent = m[1];
    const header = splitRow(line);
    const delimText = rowText(lines[i + 1], indent);
    const delim = delimText && splitRow(delimText);
    if (!header || !delim || delim.length !== header.length || !delim.every((c) => DELIM_CELL_RE.test(c))) continue;

    const indentCols = columns(indent);
    let j = i - 1;
    while (j >= 0 && (!lines[j].trim() || columns(lines[j].match(/^[ \t]*/)[0]) >= indentCols)) j--;
    const nested = j >= 0 && LIST_RE.test(lines[j]);
    // 4+ columns outside a list is an indented code block
    if (!nested && indentCols >= 4) continue;

    let end = i + 1;
    while (end + 1 < lines.length) {
      const text = rowText(lines[end + 1], indent);
      if (!text || !splitRow(text)) break;
      end++;
    }
    tables.push({ start: i, end, indent, nested });
    i = end;
  }
  return tables;
}

function tableMarkdown(lines, table) {
  return lines
    .slice(table.start, table.end + 1)
    .map((l) => l.slice(table.indent.length))
    .join("\n");
}

class TableWidget extends WidgetType {
  constructor(app, markdown, path, from, indentCols) {
    super();
    this.app = app;
    this.markdown = markdown;
    this.path = path;
    this.from = from;
    this.indentCols = indentCols;
  }

  eq(other) {
    return other.markdown === this.markdown && other.from === this.from && other.path === this.path;
  }

  toDOM(view) {
    const el = createDiv({ cls: ["indented-table-render", "cm-embed-block", "markdown-rendered"] });
    el.style.paddingLeft = `${this.indentCols}ch`;
    this.child = new MarkdownRenderChild(el);
    this.child.load();
    MarkdownRenderer.render(this.app, this.markdown, el, this.path, this.child);
    // Clicking the rendered table puts the cursor in it, which shows the source again
    el.addEventListener("mousedown", (evt) => {
      if (evt.button !== 0 || evt.target.closest("a, button, input")) return;
      evt.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return el;
  }

  ignoreEvent() {
    return true;
  }

  destroy() {
    if (this.child) this.child.unload();
  }
}

function isLivePreview(state) {
  try {
    return state.field(editorLivePreviewField, false) === true;
  } catch {
    return false;
  }
}

const tableCache = new WeakMap();
function docTables(doc) {
  let tables = tableCache.get(doc);
  if (!tables) {
    const lines = doc.toString().split("\n");
    tables = findTables(lines).map((t) => ({ ...t, markdown: tableMarkdown(lines, t) }));
    tableCache.set(doc, tables);
  }
  return tables;
}

function buildDecorations(app, state) {
  if (!isLivePreview(state)) return Decoration.none;
  const doc = state.doc;
  const path = state.field(editorInfoField, false)?.file?.path ?? "";
  const ranges = [];
  for (const t of docTables(doc)) {
    const from = doc.line(t.start + 1).from;
    const to = doc.line(t.end + 1).to;
    if (state.selection.ranges.some((r) => r.from <= to && r.to >= from)) continue;
    const widget = new TableWidget(app, t.markdown, path, from, columns(t.indent));
    ranges.push(Decoration.replace({ widget, block: true }).range(from, to));
  }
  return Decoration.set(ranges);
}

function livePreviewField(app) {
  return StateField.define({
    create: (state) => buildDecorations(app, state),
    update(value, tr) {
      if (tr.docChanged || tr.selection || isLivePreview(tr.startState) !== isLivePreview(tr.state)) {
        return buildDecorations(app, tr.state);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

module.exports = class IndentedTableRender extends Plugin {
  onload() {
    this.registerEditorExtension(livePreviewField(this.app));

    // Reading view: re-render sections whose indented tables came out as plain text
    let cached = { text: null, tables: [] };
    this.registerMarkdownPostProcessor((el, ctx) => {
      const info = ctx.getSectionInfo(el);
      if (!info || el.querySelector("table")) return;
      if (cached.text !== info.text) cached = { text: info.text, tables: findTables(info.text.split("\n")) };
      const tables = cached.tables.filter((t) => t.start >= info.lineStart && t.end <= info.lineEnd);
      if (!tables.length) return;

      const lines = info.text.split("\n");
      const out = [];
      let i = info.lineStart;
      for (const t of tables) {
        out.push(...lines.slice(i, t.start), "");
        const rows = lines.slice(t.start, t.end + 1);
        out.push(...(t.nested ? rows : rows.map((l) => l.slice(t.indent.length))), "");
        i = t.end + 1;
      }
      out.push(...lines.slice(i, info.lineEnd + 1));

      const child = new MarkdownRenderChild(el);
      ctx.addChild(child);
      el.empty();
      MarkdownRenderer.render(this.app, out.join("\n"), el, ctx.sourcePath, child);
    });
  }
};
