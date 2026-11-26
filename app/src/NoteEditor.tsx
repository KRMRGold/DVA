import { defaultKeymap } from "@codemirror/commands";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import { useLayoutEffect, useRef } from "react";
import { interactiveBlocks, type PanelTargets, updatePanelTargets } from "./NotePreview";
import type { HistoryDirection, NoteEdit, NoteSelection } from "./WorkspaceHistory";

type NoteEditorProps = {
  label: string;
  value: string;
  targets: PanelTargets;
  restoreSelection: NoteSelection | null;
  onFocus: () => void;
  onChange: (value: string, edit: NoteEdit) => void;
  onHistory: (direction: HistoryDirection) => void;
  onOpenPanel: (id: number) => void;
};

const externalChange = Annotation.define<boolean>();
const editorAttributes = (label: string) => EditorView.contentAttributes.of({
  "aria-label": label,
  "aria-multiline": "true",
  spellcheck: "true",
});

function describeEdit(update: ViewUpdate): NoteEdit {
  const { main: before } = update.startState.selection;
  const { main: after } = update.state.selection;
  const transactions = update.transactions.filter((transaction) => transaction.docChanged);
  let kind: NoteEdit["kind"] = null;
  if (before.empty && after.empty) {
    if (transactions.every((transaction) => transaction.isUserEvent("input.type"))) kind = "typing";
    else if (transactions.every((transaction) => transaction.isUserEvent("delete.backward"))) kind = "backspace";
    else if (transactions.every((transaction) => transaction.isUserEvent("delete.forward"))) kind = "delete";
  }
  return { before: { anchor: before.anchor, head: before.head }, after: { anchor: after.anchor, head: after.head }, kind, time: Date.now() };
}

function changedRange(previous: string, next: string) {
  let from = 0;
  while (from < previous.length && from < next.length && previous[from] === next[from]) from += 1;
  let to = previous.length;
  let nextEnd = next.length;
  while (to > from && nextEnd > from && previous[to - 1] === next[nextEnd - 1]) {
    to -= 1;
    nextEnd -= 1;
  }
  return { from, to, insert: next.slice(from, nextEnd) };
}

export function NoteEditor(props: NoteEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const latest = useRef(props);
  const attributes = useRef(new Compartment());

  useLayoutEffect(() => {
    latest.current = props;
  });

  useLayoutEffect(() => {
    if (!host.current) return;
    const initial = latest.current;
    const settings = attributes.current;

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          keymap.of(defaultKeymap),
          EditorView.domEventHandlers({
            beforeinput(event) {
              if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return false;
              latest.current.onHistory(event.inputType === "historyUndo" ? "undo" : "redo");
              return true;
            },
          }),
          EditorView.lineWrapping,
          settings.of(editorAttributes(initial.label)),
          placeholder("Write something. You can organize it later."),
          interactiveBlocks(initial.targets, (id) => latest.current.onOpenPanel(id)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((transaction) => transaction.annotation(externalChange))) {
              latest.current.onChange(update.state.doc.toString(), describeEdit(update));
            }
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const view = editor.current;
    if (!view) return;
    const previous = view.state.doc.toString();
    const next = props.value.replace(/\r\n/g, "\n");
    const restore = props.restoreSelection;
    if (previous === next && !restore) return;
    view.dispatch({
      changes: previous === next ? undefined : changedRange(previous, next),
      selection: restore ? {
        anchor: Math.min(next.length, restore.anchor),
        head: Math.min(next.length, restore.head),
      } : undefined,
      annotations: externalChange.of(true),
      scrollIntoView: Boolean(restore),
    });
    if (restore) view.focus();
  }, [props.value, props.restoreSelection]);

  useLayoutEffect(() => {
    editor.current?.dispatch({ effects: attributes.current.reconfigure(editorAttributes(props.label)) });
  }, [props.label]);

  useLayoutEffect(() => {
    editor.current?.dispatch({ effects: updatePanelTargets.of(props.targets) });
  }, [props.targets]);

  return <div className="note-editor" ref={host} onFocus={props.onFocus} />;
}
