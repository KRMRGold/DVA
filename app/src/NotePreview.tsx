import { MapMode, StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";

type NoteButton = { type: "button"; label: string; target: string };
type NoteCarousel = { type: "carousel"; label: string; items: string[] };
type NoteComponent = NoteButton | NoteCarousel;

export type InteractiveNote = {
  body: string;
  end: number | null;
  itemId: string | null;
  components: NoteComponent[];
  error: string | null;
};

const interactiveKey = /^(?:id|components|"id"|"components"|'id'|'components')[ \t]*:/m;

export function readInteractiveNote(source: string): InteractiveNote | null {
  const opening = /^\uFEFF?[ \t]*---[ \t]*\r?\n/.exec(source);
  if (!opening) return null;

  const afterOpening = source.slice(opening[0].length);
  // A pasted block can keep its outer indentation even when the first fence does not.
  const indent = /^([ \t]*)[^ \t\r\n#]/m.exec(afterOpening)?.[1] ?? "";
  const fence = new RegExp("^[ \\t]{0," + indent.length + "}---[ \\t]*(?:\\r?\\n|$)", "m");
  const closing = fence.exec(afterOpening);
  const rawHeader = closing ? afterOpening.slice(0, closing.index) : afterOpening;
  const header = indent ? rawHeader.replace(new RegExp("^" + indent, "gm"), "") : rawHeader;
  const note: InteractiveNote = {
    body: closing ? afterOpening.slice(closing.index + closing[0].length) : "",
    end: closing ? opening[0].length + closing.index + closing[0].replace(/\r?\n$/, "").length : null,
    itemId: null,
    components: [],
    error: null,
  };

  if (!closing) {
    return interactiveKey.test(header)
      ? { ...note, error: "Close the YAML front matter with --- on its own line." }
      : null;
  }

  let definition;
  try {
    definition = parseDocument(header);
  } catch {
    return interactiveKey.test(header) ? { ...note, error: "The YAML front matter could not be read." } : null;
  }

  if (definition.errors.length > 0 || definition.warnings.length > 0) {
    return interactiveKey.test(header) ? { ...note, error: "The YAML front matter is invalid." } : null;
  }
  if (!definition.has("id") && !definition.has("components")) return null;

  const id = definition.get("id");
  if (definition.has("id") && (typeof id !== "string" || !id.trim())) {
    return { ...note, error: "Use a non-empty text value for id." };
  }
  if (typeof id === "string") note.itemId = id.trim();

  if (!definition.has("components")) return note;
  const components = definition.get("components", true);
  if (!isSeq(components)) return { ...note, error: "Use a YAML list for components." };

  for (const [index, component] of components.items.entries()) {
    const position = "Component " + (index + 1);
    if (!isMap(component)) return { ...note, components: [], error: position + " needs a type and label." };
    const type = component.get("type");
    const label = component.get("label");

    if (type === "button") {
      const action = component.get("action", true);
      const target = isMap(action) && action.get("id") === "open-item" ? action.get("target") : undefined;
      if (typeof label !== "string" || !label.trim() || typeof target !== "string" || !target.trim()) {
        return { ...note, components: [], error: position + " needs a label and an open-item action with a text target." };
      }
      note.components.push({ type, label: label.trim(), target: target.trim() });
    } else if (type === "carousel") {
      const items = component.get("items", true);
      const ids = isSeq(items) ? items.items.map((item) => isScalar(item) && typeof item.value === "string" ? item.value.trim() : "") : [];
      if (typeof label !== "string" || !label.trim() || !ids.length || ids.some((id) => !id)) {
        return { ...note, components: [], error: position + " needs a label and a non-empty list of text IDs in items." };
      }
      note.components.push({ type, label: label.trim(), items: ids });
    } else {
      return { ...note, components: [], error: position + " must have type: button or type: carousel." };
    }
  }

  return note;
}

type NoteBlock = Pick<InteractiveNote, "itemId" | "components" | "error"> & { from: number; to: number };
export type PanelTarget = { id: number; title: string; excerpt: string };
export type PanelTargets = ReadonlyMap<string, PanelTarget | null>;

export function findNoteBlocks(source: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  const fence = /^[\uFEFF \t]*---[ \t]*(?=\r?\n)/gm;
  for (let opening = fence.exec(source); opening; opening = fence.exec(source)) {
    const note = readInteractiveNote(source.slice(opening.index));
    if (note?.end == null) continue;
    const to = opening.index + note.end;
    blocks.push({ from: opening.index, to, itemId: note.itemId, components: note.components, error: note.error });
    fence.lastIndex = to;
  }
  return blocks;
}

export function panelExcerpt(source: string, blocks: NoteBlock[], title: string) {
  const prose: string[] = [];
  let start = 0;
  for (const block of blocks) {
    prose.push(source.slice(start, block.from));
    start = block.to;
  }
  prose.push(source.slice(start));
  const lines = prose.join("").trim().split(/\r?\n/);
  if (lines[0]?.trim() === title) lines.shift();
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 180 ? text.slice(0, 177).trimEnd() + "…" : text;
}

function sameTarget(a: PanelTarget | null | undefined, b: PanelTarget | null | undefined) {
  return a === b || Boolean(a && b && a.id === b.id && a.title === b.title && a.excerpt === b.excerpt);
}

function targetMessage(id: string, target: null | undefined) {
  return target === null ? 'More than one panel uses the ID "' + id + '".' : 'No open panel uses the ID "' + id + '".';
}

export const updatePanelTargets = StateEffect.define<PanelTargets>();
const toggleSource = StateEffect.define<{ from: number; expanded: boolean }>();
let previewId = 0;

function carouselView(
  component: NoteCarousel,
  targets: PanelTargets,
  positions: Map<number, number>,
  componentIndex: number,
  onOpenPanel: (id: number) => void,
) {
  const carousel = document.createElement("div");
  carousel.className = "note-carousel";
  carousel.setAttribute("role", "group");
  carousel.setAttribute("aria-roledescription", "carousel");
  carousel.setAttribute("aria-label", component.label);

  const title = document.createElement("strong");
  title.className = "note-carousel-title";
  title.textContent = component.label;

  const card = document.createElement("div");
  card.className = "note-carousel-card";
  card.id = "note-carousel-card-" + ++previewId;
  card.setAttribute("aria-live", "polite");
  card.setAttribute("aria-atomic", "true");

  const navigation = document.createElement("div");
  navigation.className = "note-carousel-navigation";
  const position = document.createElement("span");
  position.className = "note-carousel-position";
  let index = Math.min(positions.get(componentIndex) ?? 0, component.items.length - 1);

  function navigationButton(label: string, step: number) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = label;
    button.setAttribute("aria-controls", card.id);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = index + step;
      if (next < 0 || next >= component.items.length) return;
      index = next;
      positions.set(componentIndex, index);
      showCard();
    });
    return button;
  }

  const previous = navigationButton("Previous", -1);
  const next = navigationButton("Next", 1);
  navigation.append(previous, position, next);

  function showCard() {
    position.textContent = (index + 1) + " of " + component.items.length;
    previous.setAttribute("aria-disabled", String(index === 0));
    next.setAttribute("aria-disabled", String(index === component.items.length - 1));

    const id = component.items[index];
    const target = targets.get(id);
    card.replaceChildren();
    if (!target) {
      const message = document.createElement("p");
      message.className = "note-preview-message";
      message.textContent = targetMessage(id, target);
      card.append(message);
      return;
    }

    const open = document.createElement("button");
    open.type = "button";
    open.className = "note-carousel-open";
    open.textContent = target.title;
    open.setAttribute("aria-label", "Open " + target.title);
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpenPanel(target.id);
    });
    card.append(open);
    if (target.excerpt) {
      const excerpt = document.createElement("p");
      excerpt.textContent = target.excerpt;
      card.append(excerpt);
    }
  }

  carousel.append(title, navigation, card);
  showCard();
  return carousel;
}

class NoteBlockWidget extends WidgetType {
  constructor(
    private readonly note: NoteBlock,
    private readonly expanded: boolean,
    private readonly targets: PanelTargets,
    private readonly carouselPositions: Map<number, number>,
    private readonly onOpenPanel: (id: number) => void,
  ) {
    super();
  }

  eq(other: NoteBlockWidget) {
    const { note } = this;
    return note.from === other.note.from && note.to === other.note.to &&
      this.expanded === other.expanded && note.error === other.note.error &&
      note.itemId === other.note.itemId && note.components.length === other.note.components.length &&
      note.components.every((component, index) => {
        const next = other.note.components[index];
        if (component.type !== next.type || component.label !== next.label) return false;
        const ids = component.type === "button" ? [component.target] : component.items;
        const nextIds = next.type === "button" ? [next.target] : next.items;
        return ids.length === nextIds.length && ids.every((id, item) =>
          id === nextIds[item] && sameTarget(this.targets.get(id), other.targets.get(id)),
        );
      });
  }

  toDOM(view: EditorView) {
    const { note } = this;
    const block = document.createElement("div");
    block.className = "note-block";

    const disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.className = "note-block-toggle";
    const toggleLabel = this.expanded ? "Hide YAML source" : "Show YAML source";
    disclosure.textContent = this.expanded ? "▾" : "▸";
    disclosure.title = toggleLabel;
    disclosure.setAttribute("aria-label", toggleLabel);
    disclosure.setAttribute("aria-expanded", String(this.expanded));
    disclosure.addEventListener("click", (event) => {
      event.stopPropagation();
      const expanded = !this.expanded;
      const anchor = expanded ? view.state.doc.line(view.state.doc.lineAt(note.from).number + 1).from : note.to;
      view.dispatch({
        effects: toggleSource.of({ from: note.from, expanded }),
        selection: { anchor },
        scrollIntoView: true,
      });
      view.focus();
    });
    block.append(disclosure);

    const controls = document.createElement("div");
    controls.className = "note-block-controls";
    block.append(controls);
    if (note.itemId) {
      const id = document.createElement("code");
      id.className = "note-block-id";
      id.textContent = note.itemId;
      controls.append(id);
    }
    if (note.error) {
      const error = document.createElement("p");
      error.className = "note-preview-message";
      error.setAttribute("role", "alert");
      error.textContent = note.error;
      controls.append(error);
    }

    for (const [index, component] of note.components.entries()) {
      if (component.type === "carousel") {
        controls.append(carouselView(component, this.targets, this.carouselPositions, index, this.onOpenPanel));
        continue;
      }
      const { label, target } = component;
      const group = document.createElement("div");
      group.className = "note-preview-control";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = label;
      const panel = this.targets.get(target);
      group.append(button);
      if (panel) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          this.onOpenPanel(panel.id);
        });
      } else {
        button.disabled = true;
        const message = document.createElement("p");
        message.className = "note-preview-message";
        message.id = "note-target-message-" + ++previewId;
        message.textContent = targetMessage(target, panel);
        button.setAttribute("aria-describedby", message.id);
        group.append(message);
      }
      controls.append(group);
    }
    return block;
  }
}

type BlockState = {
  decorations: DecorationSet;
  expanded: ReadonlySet<number>;
  targets: PanelTargets;
};

export function interactiveBlocks(initialTargets: PanelTargets, onOpenPanel: (id: number) => void) {
  const carouselPositions = new Map<number, Map<number, number>>();

  function build(state: EditorState, expanded: ReadonlySet<number>, targets: PanelTargets): BlockState {
    const blocks = findNoteBlocks(state.doc.toString());
    const blockStarts = new Set(blocks.map((block) => block.from));
    for (const from of carouselPositions.keys()) {
      if (!blockStarts.has(from)) carouselPositions.delete(from);
    }
    const ranges = blocks.map((note) => {
      const isExpanded = expanded.has(note.from);
      const positions = carouselPositions.get(note.from) ?? new Map<number, number>();
      carouselPositions.set(note.from, positions);
      const widget = new NoteBlockWidget(note, isExpanded, targets, positions, onOpenPanel);
      return isExpanded
        ? Decoration.widget({ widget, block: true, side: 1 }).range(note.to)
        : Decoration.replace({ widget, block: true }).range(note.from, note.to);
    });
    return { decorations: Decoration.set(ranges, true), expanded, targets };
  }

  const field = StateField.define<BlockState>({
    create: (state) => build(state, new Set(), initialTargets),
    update(current, transaction) {
      let targets = current.targets;
      const toggle = transaction.effects.find((effect) => effect.is(toggleSource))?.value;
      const replacementTargets = transaction.effects.find((effect) => effect.is(updatePanelTargets))?.value;
      if (replacementTargets && (
        replacementTargets.size !== targets.size ||
        [...replacementTargets].some(([id, panel]) => !sameTarget(targets.get(id), panel))
      )) targets = replacementTargets;
      if (!transaction.docChanged && !toggle && targets === current.targets) return current;

      function mapBlockStart(position: number) {
        const mapped = transaction.changes.mapPos(position, 1, MapMode.TrackDel);
        return mapped === null ? null : transaction.state.doc.lineAt(mapped).from;
      }

      if (transaction.docChanged) {
        const positions = [...carouselPositions];
        carouselPositions.clear();
        for (const [from, selection] of positions) {
          const mapped = mapBlockStart(from);
          if (mapped !== null) carouselPositions.set(mapped, selection);
        }
      }
      const expanded = new Set<number>();
      for (const position of current.expanded) {
        const mapped = mapBlockStart(position);
        if (mapped !== null) expanded.add(mapped);
      }
      if (toggle) {
        if (toggle.expanded) expanded.add(toggle.from);
        else expanded.delete(toggle.from);
      }
      return build(transaction.state, expanded, targets);
    },
    provide: (field) => [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).decorations),
    ],
  });
  return field;
}
