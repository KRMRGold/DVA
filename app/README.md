# DVA app prototype

This folder contains DVA's Tauri, React, and TypeScript desktop app. The workspace supports editable panels, search, autosave, and restoration from workspace JSON.

## Run locally

From this folder, install the locked dependencies and start the desktop app.

```sh
npm ci
npm run tauri dev
```

Run `npm test` for frontend tests and `npm run build` to type-check and build the frontend.

## Undo and redo

Use **Undo** and **Redo** in the toolbar for writing, YAML edits, and creating, closing, moving, or resizing panels. The keyboard shortcuts are **Ctrl/Cmd+Z** for undo and **Ctrl+Y** or **Ctrl/Cmd+Shift+Z** for redo.

History follows the order of changes across all panels in the current session. Consecutive typing is grouped into one step. DVA autosaves the resulting state after an undo or redo.

## Move and resize panels

Drag a panel by the grip next to its title. DVA previews the new order as you drag. Drag the bottom-right corner to change the width and height. DVA saves the order and dimensions when you release the mouse.

With the grip focused, use the arrow keys to move the panel one place at a time. With the resize handle focused, use the arrow keys to adjust its width or height.

## Try a YAML button

### Story outline panel

Paste the whole block into a new panel, including both `---` lines.

```text
---
id: story-outline
---
Story outline

Chapter one
```

### Story draft panel

Paste this block into a second panel. The YAML sits between two passages of writing.

```text
Story draft

This paragraph comes before the button.

---
components:
  - type: button
    label: Open outline
    action:
      id: open-item
      target: story-outline
---

Keep writing below the button.
```

When the closing `---` is complete, the **Open outline** button appears between the paragraphs. Click it to focus the outline panel. Use the **▸** arrow beside the button to reveal and edit the YAML, and click **▾** to fold it again.

Use a unique text `id` for each target. The source and its YAML save together. Preview shows why an action is unavailable if the target is missing or its ID is shared by multiple panels.

## Try a YAML carousel

Keep the **Story outline** panel from the button example. Add a panel for the second card and paste in this note.

```text
---
id: character-notes
---
Character notes

Mara keeps the silver key.
```

Then add this block anywhere in **Story draft**.

```text
---
components:
  - type: carousel
    label: Scene references
    items:
      - story-outline
      - character-notes
---
```

Use **Previous** and **Next** to browse the cards. Click a card title to focus the linked panel. The **▸** arrow reveals the YAML so you can change the label or add and reorder items.


See the [DVA test record](../DVA-Test-Record.md) and [design document](../DVAInitialDesignDoc.md).
