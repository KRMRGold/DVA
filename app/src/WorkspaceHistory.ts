export type PanelSize = { width: number; height: number };
export type Panel = { id: number; title: string; content: string; size?: PanelSize };
export type PanelPlacement = { targetId: number; after: boolean };
export type WorkspaceSnapshot = { panels: Panel[]; activePanelId: number };
export type NoteSelection = { anchor: number; head: number };
export type HistoryDirection = "undo" | "redo";

export type NoteEdit = {
  before: NoteSelection;
  after: NoteSelection;
  kind: "typing" | "backspace" | "delete" | null;
  time: number;
};

type EditStep = NoteEdit & { panelId: number };

type HistoryStep = {
  before: WorkspaceSnapshot;
  after: WorkspaceSnapshot;
  edit: EditStep | null;
};

type WorkspaceHistory = {
  current: WorkspaceSnapshot;
  past: HistoryStep[];
  future: HistoryStep[];
  restore: { panelId: number; selection: NoteSelection | null } | null;
};

export type WorkspaceAction =
  | { type: "load"; snapshot: WorkspaceSnapshot }
  | { type: "activate"; id: number }
  | { type: "add" }
  | { type: "close"; id: number }
  | { type: "edit"; panel: Pick<Panel, "id" | "title" | "content">; edit: NoteEdit }
  | { type: "move"; id: number; placement: PanelPlacement }
  | { type: "resize"; id: number; size: PanelSize }
  | { type: HistoryDirection };

const historyLimit = 100;
const typingWindow = 750;

export function initialWorkspaceHistory(current: WorkspaceSnapshot): WorkspaceHistory {
  return { current, past: [], future: [], restore: null };
}

function record(state: WorkspaceHistory, after: WorkspaceSnapshot, edit: EditStep | null = null): WorkspaceHistory {
  const before = state.current;
  const recent = state.past[state.past.length - 1];
  const previous = recent?.edit;
  if (
    edit?.kind && previous?.kind === edit.kind &&
    previous.panelId === edit.panelId && recent.after === before &&
    state.future.length === 0 && edit.time - previous.time <= typingWindow &&
    previous.after.anchor === edit.before.anchor && previous.after.head === edit.before.head
  ) {
    const grouped = { ...edit, before: previous.before };
    return { current: after, past: [...state.past.slice(0, -1), { before: recent.before, after, edit: grouped }], future: [], restore: null };
  }
  return {
    current: after,
    past: [...state.past, { before, after, edit }].slice(-historyLimit),
    future: [],
    restore: null,
  };
}

export function movePanel(panels: Panel[], id: number, { targetId, after }: PanelPlacement) {
  if (id === targetId) return panels;
  const source = panels.findIndex((panel) => panel.id === id);
  const target = panels.findIndex((panel) => panel.id === targetId);
  if (source === -1 || target === -1) return panels;

  const destination = target + Number(after) - Number(source < target);
  if (source === destination) return panels;
  const reordered = panels.slice();
  reordered.splice(source, 1);
  reordered.splice(destination, 0, panels[source]);
  return reordered;
}

export function workspaceHistoryReducer(state: WorkspaceHistory, action: WorkspaceAction): WorkspaceHistory {
  const { current, past, future } = state;
  switch (action.type) {
    case "load":
      return initialWorkspaceHistory(action.snapshot);
    case "activate":
      if (current.activePanelId === action.id || !current.panels.some((panel) => panel.id === action.id)) return state;
      return { ...state, current: { ...current, activePanelId: action.id }, restore: null };
    case "add": {
      const id = current.panels.reduce((maximum, panel) => Math.max(maximum, panel.id), 0) + 1;
      return record(state, { panels: [...current.panels, { id, title: "Untitled", content: "" }], activePanelId: id });
    }
    case "close": {
      const panels = current.panels.filter((panel) => panel.id !== action.id);
      if (panels.length === current.panels.length) return state;
      const activePanelId = current.activePanelId === action.id ? panels[panels.length - 1]?.id ?? 0 : current.activePanelId;
      return record(state, { panels, activePanelId });
    }
    case "move": {
      const panels = movePanel(current.panels, action.id, action.placement);
      return panels === current.panels ? state : record(state, { panels, activePanelId: action.id });
    }
    case "resize": {
      const existing = current.panels.find((panel) => panel.id === action.id);
      if (!existing || (existing.size?.width === action.size.width && existing.size.height === action.size.height)) return state;
      const panels = current.panels.map((panel) => panel.id === action.id ? { ...panel, size: action.size } : panel);
      return record(state, { panels, activePanelId: action.id });
    }
    case "edit": {
      const existing = current.panels.find((panel) => panel.id === action.panel.id);
      if (!existing || existing.content === action.panel.content) return state;
      const panels = current.panels.map((panel) => panel.id === action.panel.id ? { ...panel, ...action.panel } : panel);
      return record(state, { ...current, panels }, { ...action.edit, panelId: action.panel.id });
    }
    case "undo":
    case "redo": {
      const undo = action.type === "undo";
      const stack = undo ? past : future;
      const step = stack[stack.length - 1];
      if (!step) return state;
      const snapshot = undo ? step.before : step.after;
      const panelId = step.edit?.panelId ?? snapshot.activePanelId;
      return {
        current: { ...snapshot, activePanelId: panelId },
        past: undo ? past.slice(0, -1) : [...past, step],
        future: undo ? [...future, step] : future.slice(0, -1),
        restore: { panelId, selection: step.edit ? (undo ? step.edit.before : step.edit.after) : null },
      };
    }
  }
}
