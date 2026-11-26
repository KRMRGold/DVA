import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function panelEditor(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element);
  if (!view) throw new Error("The panel editor is missing.");
  return view;
}

function setPanelText(element: HTMLElement, text: string) {
  const view = panelEditor(element);
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
}

function panelSource(element: HTMLElement) {
  return panelEditor(element).state.doc.toString();
}

beforeEach(() => {
  localStorage.clear();
});

describe("DVA workspace shell", () => {
  it("shows a visible version label", () => {
    render(<App />);
    expect(screen.getByLabelText(/app version/i)).toHaveTextContent("0.2.0");
  });

  it("starts with an editable panel", () => {
    render(<App />);
    expect(screen.getByRole("textbox", { name: "Untitled content" })).toBeInTheDocument();
  });

  it("creates a separate panel without replacing the first", () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "First note");
    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    expect(screen.getByRole("textbox", { name: "First note content" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("keeps another panel when one panel is closed", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    const panels = screen.getAllByRole("article");
    setPanelText(within(panels[0]).getByRole("textbox"), "Keep this");
    setPanelText(within(panels[1]).getByRole("textbox"), "Close this");
    fireEvent.click(screen.getByRole("button", { name: "Close Close this panel" }));
    expect(screen.getByRole("textbox", { name: "Keep this content" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Close this content" })).not.toBeInTheDocument();
  });

  it("shows an empty state and can recover by creating a panel", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /close untitled panel/i }));
    expect(screen.getByText("Start anywhere.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create a panel/i }));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("automatically restores panel contents after the app remounts", async () => {
    const firstRender = render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "A saved note");
    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    await waitFor(() => expect(localStorage.getItem("dva.workspace.v1")).toContain("A saved note"));
    firstRender.unmount();

    render(<App />);
    expect(panelSource(screen.getByRole("textbox", { name: "A saved note content" }))).toBe("A saved note");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("preserves malformed saved data and pauses autosave for recovery", async () => {
    const original = "{ this is not valid JSON and must survive }";
    localStorage.setItem("dva.workspace.v1", original);

    render(<App />);

    expect(await screen.findByText("Your saved writing was not replaced.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Original saved workspace data" })).toHaveValue(original);
    expect(localStorage.getItem("dva.workspace.v1")).toBe(original);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("preserves structurally invalid saved data rather than replacing it with a starter workspace", async () => {
    const original = JSON.stringify({ panels: [{ id: "bad", title: "Lost?", content: "Keep me" }], activePanelId: 1 });
    localStorage.setItem("dva.workspace.v1", original);

    render(<App />);

    expect(await screen.findByText("Your saved writing was not replaced.")).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("dva.workspace.v1")).toBe(original));
    expect(screen.queryByRole("textbox", { name: /content/i })).not.toBeInTheDocument();
  });

  it("creates a panel with Ctrl+N", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("opens panel search with Ctrl+F and jumps to a matching panel", () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "Find the moon");
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const search = screen.getByRole("textbox", { name: "Search panels" });
    fireEvent.change(search, { target: { value: "moon" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find the moon content" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Focus Find the moon panel" })).toHaveFocus();
  });

  it("saves with Ctrl+S and reports completion", async () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "Saved with shortcut");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(localStorage.getItem("dva.workspace.v1")).toContain("Saved with shortcut"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved locally"));
  });
});

describe("interactive note preview", () => {
  const outline = [
    "---",
    "id: story-outline",
    "---",
    "Story outline",
    "Chapter one",
  ].join("\n");
  const story = [
    "---",
    "components:",
    "  - type: button",
    "    label: Open outline",
    "    action:",
    "      id: open-item",
    "      target: story-outline",
    "---",
    "Story draft",
  ].join("\n");

  function storyPanel() {
    return within(screen.getByRole("article", { name: "Story draft" }));
  }

  it("renders a saved button and focuses the linked panel after reopening", async () => {
    const firstRender = render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), story);
    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), outline);

    await waitFor(() => {
      const saved = localStorage.getItem("dva.workspace.v1");
      expect(saved).toContain("Open outline");
      expect(saved).toContain("Chapter one");
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved locally"));
    firstRender.unmount();

    render(<App />);
    const preview = storyPanel();
    expect(preview.getByText("Story draft", { selector: ".cm-line" })).toBeVisible();
    expect(panelSource(preview.getByRole("textbox", { name: "Story draft content" }))).toBe(story);
    fireEvent.click(preview.getByRole("button", { name: "Open outline" }));
    expect(screen.getByRole("button", { name: "Focus Story outline panel" })).toHaveFocus();
    expect(screen.getByText("Active panel: Story outline")).toBeInTheDocument();
  });

  it("opens a saved preview when copied examples have indented YAML fences", () => {
    const indentPastedLines = (source: string) => source.replace(/\n(?=.)/g, "\n   ");
    const pastedOutline = indentPastedLines(outline);
    const pastedStory = indentPastedLines(story);
    localStorage.setItem("dva.workspace.v1", JSON.stringify({
      panels: [
        { id: 1, title: "---", content: pastedOutline },
        { id: 2, title: "---", content: pastedStory },
      ],
      activePanelId: 2,
    }));

    render(<App />);
    const preview = storyPanel();
    expect(panelSource(preview.getByRole("textbox"))).toBe(pastedStory);
    fireEvent.click(preview.getByRole("button", { name: "Open outline" }));
    expect(screen.getByRole("button", { name: "Focus Story outline panel" })).toHaveFocus();
    expect(panelSource(screen.getByRole("textbox", { name: "Story outline content" }))).toBe(pastedOutline);
  });

  it("keeps a separator inside a YAML block label as part of the label", () => {
    const multilineLabel = story.replace("label: Open outline", "label: |-\n      Open\n      ---\n      outline");
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), multilineLabel);
    const preview = storyPanel();
    expect(preview.getByRole("button", { name: /Open\s+---\s+outline/ })).toBeDisabled();
  });

  it("renders a button between paragraphs when its closing fence is typed and allows inline editing", () => {
    render(<App />);
    const yaml = story.slice(0, story.lastIndexOf("---") + 3);
    const prefix = "Story draft\n\n" + yaml.slice(0, -1);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), prefix);
    const draft = storyPanel();
    const editor = panelEditor(draft.getByRole("textbox"));
    expect(draft.queryByRole("button", { name: "Open outline" })).not.toBeInTheDocument();

    const beforeClosing = editor.state.doc.length;
    act(() => editor.dispatch({
      changes: { from: beforeClosing, insert: "-" },
      selection: { anchor: beforeClosing + 1 },
    }));
    expect(draft.getByRole("button", { name: "Open outline" })).toBeInTheDocument();

    act(() => editor.dispatch({
      changes: { from: editor.state.doc.length, insert: "\n\nKeep writing here." },
    }));
    const before = draft.getByText("Story draft", { selector: ".cm-line" });
    const action = draft.getByRole("button", { name: "Open outline" });
    const after = draft.getByText("Keep writing here.", { selector: ".cm-line" });
    expect(before.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(draft.getByRole("button", { name: "Show YAML source" }));
    expect(draft.getByText("components:", { selector: ".cm-line" })).toBeVisible();
    const label = editor.state.doc.toString().indexOf("Open outline");
    act(() => editor.dispatch({ changes: { from: label, to: label + "Open outline".length, insert: "Go to outline" } }));
    expect(draft.getByRole("button", { name: "Go to outline" })).toBeInTheDocument();

    fireEvent.click(draft.getByRole("button", { name: "Hide YAML source" }));
    expect(draft.queryByText("components:", { selector: ".cm-line" })).not.toBeInTheDocument();
    expect(editor.state.doc.toString()).toContain("label: Go to outline");
    expect(after).toBeVisible();
  });

  it("keeps separate YAML blocks in order around ordinary prose", () => {
    render(<App />);
    const yaml = story.slice(0, story.lastIndexOf("---") + 3);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }),
      "Story draft\n\n" + yaml + "\n\nAnother paragraph.\n\n" + yaml.replace("Open outline", "Go to outline"));
    const draft = storyPanel();
    expect(draft.getByRole("button", { name: "Open outline" })).toBeInTheDocument();
    expect(draft.getByRole("button", { name: "Go to outline" })).toBeInTheDocument();
    expect(draft.getAllByRole("button", { name: "Show YAML source" })).toHaveLength(2);
    expect(draft.getByText("Another paragraph.", { selector: ".cm-line" })).toBeVisible();
  });


  it("disables the button when its target is missing or ambiguous", () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), story);
    const preview = storyPanel();
    const button = preview.getByRole("button", { name: "Open outline" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('No open panel uses the ID "story-outline".');

    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), outline);
    expect(preview.getByRole("button", { name: "Open outline" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), outline.replace("Story outline", "Second outline"));
    const updatedButton = preview.getByRole("button", { name: "Open outline" });
    expect(updatedButton).toBeDisabled();
    expect(updatedButton).toHaveAccessibleDescription('More than one panel uses the ID "story-outline".');
  });

  it("shows a preview error and preserves the source for an unsupported action", () => {
    render(<App />);
    const unsupported = story.replace("id: open-item", "id: open-url");
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), unsupported);
    const preview = storyPanel();

    expect(preview.getByRole("alert")).toHaveTextContent("needs a label and an open-item action");
    expect(preview.queryByRole("button", { name: "Open outline" })).not.toBeInTheDocument();
    expect(panelSource(preview.getByRole("textbox"))).toBe(unsupported);
  });
});

describe("inline carousels", () => {
  const carouselYaml = [
    "Reference shelf",
    "",
    "---",
    "components:",
    "  - type: carousel",
    "    label: Scene references",
    "    items:",
    "      - scene-map",
    "      - character-notes",
    "---",
    "",
    "Draft another scene here.",
  ].join("\n");
  const mapNote = "---\nid: scene-map\n---\nScene map\n\nThe ferry leaves from the east dock.";
  const characterNote = "---\nid: character-notes\n---\nCharacter notes\n\nMara keeps the silver key.";

  function addPanel(content: string) {
    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), content);
  }

  it("browses linked notes inline, keeps navigation focus, and opens the selected panel", () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), carouselYaml);
    addPanel(mapNote);
    addPanel(characterNote);

    const host = screen.getByRole("article", { name: "Reference shelf" });
    const group = within(host).getByRole("group", { name: "Scene references" });
    const carousel = within(group);
    const previous = carousel.getByRole("button", { name: "Previous" });
    const next = carousel.getByRole("button", { name: "Next" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(carousel.getByText("1 of 2")).toBeInTheDocument();
    expect(carousel.getByText("The ferry leaves from the east dock.")).toBeInTheDocument();
    expect(group.textContent).not.toContain("id: scene-map");
    const following = within(host).getByText("Draft another scene here.");
    expect(group.compareDocumentPosition(following) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    act(() => next.focus());
    fireEvent.click(next);
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(carousel.getByText("2 of 2")).toBeInTheDocument();
    expect(carousel.getByText("Mara keeps the silver key.")).toBeInTheDocument();
    fireEvent.click(next);
    expect(carousel.getByText("2 of 2")).toBeInTheDocument();

    fireEvent.click(previous);
    expect(carousel.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(carousel.getByRole("button", { name: "Open Scene map" }));
    expect(screen.getByRole("button", { name: "Focus Scene map panel" })).toHaveFocus();
  });

  it("keeps the selected card after editing and gives a clear message for a missing reference", () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), carouselYaml);
    addPanel(mapNote);
    const host = screen.getByRole("article", { name: "Reference shelf" });
    const getCarousel = () => within(within(host).getByRole("group", { name: "Scene references" }));

    fireEvent.click(getCarousel().getByRole("button", { name: "Next" }));
    expect(getCarousel().getByText('No open panel uses the ID "character-notes".')).toBeInTheDocument();

    fireEvent.click(within(host).getByRole("button", { name: "Show YAML source" }));
    fireEvent.click(within(host).getByRole("button", { name: "Hide YAML source" }));
    const editor = panelEditor(within(host).getByRole("textbox"));
    const paragraphEnd = "Reference shelf".length;
    act(() => editor.dispatch({ changes: { from: paragraphEnd, insert: "\n\nNew revision notes." } }));
    expect(getCarousel().getByText("2 of 2")).toBeInTheDocument();

    addPanel(characterNote);
    expect(getCarousel().getByText("2 of 2")).toBeInTheDocument();
    expect(getCarousel().getByRole("button", { name: "Open Character notes" })).toBeEnabled();
  });

  it("explains how to fix an empty carousel declaration", () => {
    render(<App />);
    const empty = carouselYaml.replace("    items:\n      - scene-map\n      - character-notes", "    items: []");
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), empty);
    expect(screen.getByRole("alert")).toHaveTextContent("needs a label and a non-empty list of text IDs in items");
    expect(screen.queryByRole("group", { name: "Scene references" })).not.toBeInTheDocument();
  });
});

describe("workspace undo and redo", () => {
  it("undoes a typing burst as one edit and restores text and cursor on redo", () => {
    render(<App />);
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    const view = panelEditor(screen.getByRole("textbox", { name: "Untitled content" }));
    for (const character of "Draft") {
      const end = view.state.doc.length;
      act(() => view.dispatch({
        changes: { from: end, insert: character },
        selection: { anchor: end + 1 },
        userEvent: "input.type",
      }));
    }

    fireEvent.click(undo);
    expect(view.state.doc.toString()).toBe("");
    expect(view.state.selection.main.head).toBe(0);
    expect(undo).toBeDisabled();
    expect(redo).toBeEnabled();

    fireEvent.keyDown(view.contentDOM, { key: "y", ctrlKey: true });
    expect(view.state.doc.toString()).toBe("Draft");
    expect(view.state.selection.main.head).toBe(5);
    expect(view.contentDOM).toHaveFocus();
    expect(redo).toBeDisabled();
  });

  it("restores a closed panel and its writing in the same history as text edits", async () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "First note");
    fireEvent.click(screen.getByRole("button", { name: /new panel/i }));
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "Second note\nKeep this writing.");
    fireEvent.click(screen.getByRole("button", { name: "Close Second note panel" }));
    expect(screen.queryByRole("article", { name: "Second note" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(panelSource(screen.getByRole("textbox", { name: "Second note content" }))).toBe("Second note\nKeep this writing.");
    expect(screen.getByRole("button", { name: "Focus Second note panel" })).toHaveFocus();
    await waitFor(() => expect(localStorage.getItem("dva.workspace.v1")).toContain("Keep this writing."));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(panelSource(screen.getByRole("textbox", { name: "Untitled content" }))).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(panelSource(screen.getByRole("textbox", { name: "First note content" }))).toBe("First note");

    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(panelSource(screen.getByRole("textbox", { name: "Second note content" }))).toBe("Second note\nKeep this writing.");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.queryByRole("article", { name: "Second note" })).not.toBeInTheDocument();
  });

  it("clears redo after a new edit and leaves undo in the search field local to the field", () => {
    render(<App />);
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "Old draft");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), "New draft");
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search panels" }), { key: "z", ctrlKey: true });
    expect(panelSource(screen.getByRole("textbox", { name: "New draft content" }))).toBe("New draft");
  });

  it("undoes and redoes a YAML edit while keeping the source expanded", () => {
    render(<App />);
    const source = "Story draft\n\n---\ncomponents:\n  - type: button\n    label: Open outline\n    action:\n      id: open-item\n      target: story-outline\n---";
    setPanelText(screen.getByRole("textbox", { name: "Untitled content" }), source);
    const panel = within(screen.getByRole("article", { name: "Story draft" }));
    fireEvent.click(panel.getByRole("button", { name: "Show YAML source" }));
    const editor = panelEditor(panel.getByRole("textbox"));
    const from = source.indexOf("Open outline");
    act(() => editor.dispatch({ changes: { from, to: from + 12, insert: "Go to outline" } }));
    expect(panel.getByRole("button", { name: "Go to outline" })).toBeInTheDocument();

    fireEvent.keyDown(editor.contentDOM, { key: "z", ctrlKey: true });
    expect(panel.getByRole("button", { name: "Open outline" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Hide YAML source" })).toBeInTheDocument();
    fireEvent.keyDown(editor.contentDOM, { key: "z", ctrlKey: true, shiftKey: true });
    expect(panel.getByRole("button", { name: "Go to outline" })).toBeInTheDocument();
  });
});

describe("panel layout", () => {
  it("saves keyboard moves and resizes, preserves size through edits, and restores layout on undo, redo, and reopen", async () => {
    const storageKey = "dva.workspace.v1";
    localStorage.setItem(storageKey, JSON.stringify({
      panels: [
        { id: 1, title: "Draft", content: "Draft\nKeep this writing." },
        { id: 2, title: "Outline", content: "Outline" },
      ],
      activePanelId: 1,
    }));
    const session = render(<App />);
    const order = () => screen.getAllByRole("article").map((panel) => panel.getAttribute("aria-label"));
    const grip = screen.getByRole("button", { name: "Focus Draft panel" });
    const draft = screen.getByRole("article", { name: "Draft" });
    const resize = within(draft).getByRole("button", { name: "Resize Draft panel" });
    const width = () => draft.style.getPropertyValue("--panel-width");

    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(order()).toEqual(["Outline", "Draft"]);
    expect(grip).toHaveFocus();

    vi.spyOn(draft.parentElement!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 800));
    vi.spyOn(draft, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 420, 300));
    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(width()).toBe("444px");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(width()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(order()).toEqual(["Draft", "Outline"]);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(order()).toEqual(["Outline", "Draft"]);
    expect(width()).toBe("444px");

    setPanelText(screen.getByRole("textbox", { name: "Draft content" }), "Draft\nKeep the revised writing.");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(storageKey)!);
      expect(saved.panels).toEqual([
        { id: 2, title: "Outline", content: "Outline" },
        { id: 1, title: "Draft", content: "Draft\nKeep the revised writing.", size: { width: 444, height: 300 } },
      ]);
    });
    session.unmount();
    render(<App />);
    expect(order()).toEqual(["Outline", "Draft"]);
    const reopened = screen.getByRole("article", { name: "Draft" });
    expect(reopened.style.getPropertyValue("--panel-width")).toBe("444px");
    expect(reopened.style.getPropertyValue("--panel-height")).toBe("300px");
  });
});
