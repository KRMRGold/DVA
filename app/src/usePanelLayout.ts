import {
  useLayoutEffect, useRef, useState,
  type Dispatch, type KeyboardEvent, type PointerEvent,
} from "react";
import { movePanel, type Panel, type PanelPlacement, type PanelSize, type WorkspaceAction } from "./WorkspaceHistory";

const minimumWidth = 280;
const minimumHeight = 200;
const keyboardStep = 24;
const dragThreshold = 5;

type Bounds = { id: number; left: number; top: number; right: number; bottom: number };
type ResizeStart = {
  width: number;
  height: number;
  savedWidth: number;
  maxWidth: number;
};

type Gesture = {
  id: number;
  pointerId: number;
  x: number;
  y: number;
  grid: HTMLElement;
  control: HTMLButtonElement;
} & (
  | { kind: "move"; bounds: Bounds[] }
  | { kind: "resize"; start: ResizeStart }
);

function panelElements(grid: HTMLElement) {
  return Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-panel-id]"));
}

function resizeStart(element: HTMLElement, grid: HTMLElement, panel: Panel): ResizeStart {
  const { left, width, height } = element.getBoundingClientRect();
  return {
    width, height, savedWidth: panel.size?.width ?? width,
    maxWidth: Math.floor(grid.getBoundingClientRect().right - left),
  };
}

function measureResize(start: ResizeStart, dx: number, dy: number): PanelSize | null {
  const width = Math.round(start.width);
  const height = Math.round(start.height);
  const maxWidth = Math.max(1, start.maxWidth);
  const nextWidth = Math.min(maxWidth, Math.max(minimumWidth, Math.round(start.width + dx)));
  const nextHeight = Math.max(minimumHeight, Math.round(start.height + dy));
  if (nextWidth === width && nextHeight === height) return null;
  return { width: nextWidth === width ? Math.round(start.savedWidth) : nextWidth, height: nextHeight };
}

function dropPlacement(gesture: Extract<Gesture, { kind: "move" }>, x: number, y: number): PanelPlacement | null {
  const area = gesture.grid.parentElement?.getBoundingClientRect();
  if (!area || x < area.left || x > area.right || y < area.top || y > area.bottom) return null;

  const origin = gesture.grid.getBoundingClientRect();
  const px = x - origin.left;
  const py = y - origin.top;
  const { bounds } = gesture;
  const first = bounds[0];
  const last = bounds[bounds.length - 1];
  if (py < first.top) return { targetId: first.id, after: false };
  if (bounds.every((bound) => py > bound.bottom)) return { targetId: last.id, after: true };

  let nearest = first;
  let shortest = Infinity;
  for (const bound of bounds) {
    const distance = Math.hypot(
      Math.max(0, bound.left - px, px - bound.right),
      Math.max(0, bound.top - py, py - bound.bottom),
    );
    if (distance < shortest) {
      nearest = bound;
      shortest = distance;
    }
  }
  const hasNeighbor = bounds.some((bound) => bound.id !== nearest.id && Math.abs(bound.top - nearest.top) < 1);
  const after = hasNeighbor
    ? px > (nearest.left + nearest.right) / 2
    : py > (nearest.top + nearest.bottom) / 2;
  return { targetId: nearest.id, after };
}

type LayoutChange =
  | { type: "move"; id: number; placement: PanelPlacement }
  | { type: "resize"; id: number; size: PanelSize };

function changeAt(gesture: Gesture, x: number, y: number): LayoutChange | null {
  const dx = x - gesture.x;
  const dy = y - gesture.y;
  if (gesture.kind === "move") {
    if (Math.hypot(dx, dy) < dragThreshold) return null;
    const placement = dropPlacement(gesture, x, y);
    return placement ? { type: "move", id: gesture.id, placement } : null;
  }
  const size = measureResize(gesture.start, dx, dy);
  return size ? { type: "resize", id: gesture.id, size } : null;
}

export function usePanelLayout(panels: Panel[], dispatch: Dispatch<WorkspaceAction>) {
  const gesture = useRef<Gesture | null>(null);
  const refocus = useRef<HTMLButtonElement | null>(null);
  const [preview, setPreview] = useState<LayoutChange | null>(null);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState({ width: 0, gap: 0 });

  useLayoutEffect(() => {
    if (!grid) return;
    const measure = () => setMetrics({
      width: grid.getBoundingClientRect().width,
      gap: Number.parseFloat(getComputedStyle(grid).columnGap) || 0,
    });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid]);

  useLayoutEffect(() => {
    refocus.current?.focus();
    refocus.current = null;
  }, [panels]);

  function start(event: PointerEvent<HTMLButtonElement>, panel: Panel, kind: Gesture["kind"]) {
    if (event.button !== 0 || gesture.current || (kind === "move" && panels.length < 2)) return;
    const control = event.currentTarget;
    const element = control.closest<HTMLElement>("[data-panel-id]");
    const grid = element?.parentElement;
    if (!element || !grid) return;
    const base = { id: panel.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, grid, control };
    if (kind === "move") {
      // Keep hit targets stable as the panels shift into their prospective order.
      const origin = grid.getBoundingClientRect();
      const bounds = panelElements(grid).map((child) => {
        const { left, top, right, bottom } = child.getBoundingClientRect();
        return {
          id: Number(child.dataset.panelId), left: left - origin.left, right: right - origin.left,
          top: top - origin.top, bottom: bottom - origin.top,
        };
      });
      gesture.current = { ...base, kind, bounds };
    } else {
      gesture.current = { ...base, kind, start: resizeStart(element, grid, panel) };
    }
    control.setPointerCapture(event.pointerId);
  }

  function update(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (current?.pointerId === event.pointerId) setPreview(changeAt(current, event.clientX, event.clientY));
  }

  function finish(event: PointerEvent<HTMLElement>, commit = false) {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (commit) {
      const change = changeAt(current, event.clientX, event.clientY);
      if (change) dispatch(change);
    }
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, panel: Panel, kind: Gesture["kind"]) {
    const current = gesture.current;
    if (current && event.key === "Escape") {
      event.preventDefault();
      gesture.current = null;
      setPreview(null);
      if (current.control.hasPointerCapture(current.pointerId)) current.control.releasePointerCapture(current.pointerId);
      return;
    }
    const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (current || (!horizontal && !vertical) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();

    if (kind === "move") {
      const direction = horizontal || vertical;
      const index = panels.findIndex((candidate) => candidate.id === panel.id);
      const target = panels[index + direction];
      if (!target) return;
      refocus.current = event.currentTarget;
      dispatch({ type: "move", id: panel.id, placement: { targetId: target.id, after: direction > 0 } });
      return;
    }

    const element = event.currentTarget.closest<HTMLElement>("[data-panel-id]");
    const grid = element?.parentElement;
    if (!element || !grid) return;
    const size = measureResize(resizeStart(element, grid, panel), horizontal * keyboardStep, vertical * keyboardStep);
    if (size) dispatch({ type: "resize", id: panel.id, size });
  }

  const order = preview?.type === "move" ? movePanel(panels, preview.id, preview.placement) : panels;
  const draftOrder = order === panels ? null : new Map(order.map((panel, index) => [panel.id, index]));
  const { width, gap } = metrics;
  const columns = Math.max(1, Math.min(panels.length, Math.floor((width + gap) / (minimumWidth + gap))));
  const columnWidth = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : undefined;
  return { setGrid, columnWidth, start, update, finish, keyDown, preview, draftOrder };
}
