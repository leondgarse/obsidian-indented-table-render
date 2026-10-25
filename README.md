# Indented Table Render

Obsidian leaves indented pipe tables as plain text in Live Preview, for example a table nested in a list item:

```markdown
- test

  | f | f |
  |-|-|
  | e | e |
```

This plugin renders them as tables, without changing the note.

## Supported

- **Live Preview**: the table is shown rendered; moving the cursor into it, or clicking it, shows the Markdown source for editing.
- **Reading view**: tables Obsidian left as plain text are rendered. Tables in list items usually render already and are left alone.
- **Tables nested in list items**, at any indent.
- **Tables indented 1–3 spaces under a heading or paragraph** (Atom-style notes). 4 or more spaces outside a list is a code block in Markdown and stays one.
- Delimiter rows with 1 or more dashes (`|-|-|`, `| --- |`), alignment colons, escaped pipes `\|`, optional leading and trailing pipes.
- Tables inside fenced code blocks and the frontmatter are ignored. Flush-left tables are left to Obsidian.

A table needs a header row, then a delimiter row with the same number of cells, all at the same indent. Body rows continue while lines keep that indent and contain a `|`.

## Installation

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/leondgarse/obsidian-indented-table-render/releases/latest).
2. Put them in `<vault>/.obsidian/plugins/indented-table-render/`.
3. Reload Obsidian and enable **Indented Table Render** in **Settings → Community plugins**.

Disable other plugins that render or style indented tables (such as Nested Markdown Renderer or Indented Table), so they don't draw the same table twice.

## Releasing

1. Bump `version` in `manifest.json` and add it to `versions.json`.
2. Commit, then push a tag with the exact version, for example `git tag 0.1.1 && git push origin main 0.1.1`.

The release workflow creates the GitHub release and attaches artifact attestations for `main.js` and `manifest.json`.

## License

[MIT](LICENSE)
