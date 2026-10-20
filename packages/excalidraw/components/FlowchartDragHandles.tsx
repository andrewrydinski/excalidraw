import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import React from "react";
import {
  addNewNodes,
  CaptureUpdateAction,
  getElementBounds,
  elementsAreInFrameBounds,
  elementOverlapsWithFrame,
  isFrameElement,
  makeNextSelectedElementIds,
  Scene,
} from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";
import type {
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
} from "@excalidraw/element/types";

import "./FlowchartDragHandles.scss";

import type App from "./App";
import type { PendingExcalidrawElements } from "../types";

type Node = NonDeleted<ExcalidrawFlowchartNodeElement>;

export const getFlowchartDragSource = (app: App): Node | null => {
  const { state } = app;
  if (
    state.viewModeEnabled ||
    state.activeTool.type !== "selection" ||
    state.editingTextElement ||
    state.selectedLinearElement ||
    state.newElement ||
    state.multiElement ||
    state.selectionElement ||
    state.resizingElement ||
    state.isRotating ||
    state.selectedElementsAreBeingDragged ||
    state.editingGroupId ||
    state.openDialog ||
    state.openMenu ||
    state.contextMenu ||
    state.isCropping ||
    state.editingFrame ||
    state.isLoading ||
    app.flowchart.isCreatingChart ||
    !app.isInteractionEnabled()
  ) {
    return null;
  }
  const selected = app.scene.getSelectedElements(state);
  const element = selected[0];
  return selected.length === 1 &&
    !element.locked &&
    (element.type === "rectangle" || element.type === "diamond")
    ? element
    : null;
};

/** A pending drag never enters the scene or history until pointerup. */
export class AppFlowchartDrag {
  public pendingNodes: PendingExcalidrawElements | null = null;
  public active = false;
  private gesture: {
    source: Node;
    direction: LinkDirection;
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null = null;

  constructor(private app: App) {}

  start = (
    source: Node,
    direction: LinkDirection,
    event: React.PointerEvent,
  ) => {
    if (
      event.button !== 0 ||
      getFlowchartDragSource(this.app)?.id !== source.id
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
    this.gesture = {
      source,
      direction,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    const win = this.app.ownerWindow;
    win.addEventListener("pointermove", this.move);
    win.addEventListener("pointerup", this.drop);
    win.addEventListener("pointercancel", this.cancel);
    win.addEventListener("blur", this.cancel);
    win.addEventListener("keydown", this.keyDown, true);
  };

  private move = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    if (getFlowchartDragSource(this.app)?.id !== gesture.source.id) {
      this.cancel();
      return;
    }
    if (
      !this.active &&
      Math.hypot(
        event.clientX - gesture.clientX,
        event.clientY - gesture.clientY,
      ) < 8
    ) {
      return;
    }
    const point = viewportCoordsToSceneCoords(event, this.app.state);
    // Binding helpers can mutate their input. Isolate the preview scene so a
    // canceled drag cannot leave dangling bindings or change source versions.
    const source = {
      ...gesture.source,
      boundElements: gesture.source.boundElements?.slice() ?? null,
    };
    const previewScene = new Scene(
      this.app.scene
        .getNonDeletedElements()
        .map((element) => (element.id === source.id ? source : { ...element })),
      { skipValidation: true },
    );
    this.pendingNodes = addNewNodes(
      source,
      this.app.state,
      gesture.direction,
      previewScene,
      1,
      null,
      {
        x: point.x - source.width / 2,
        y: point.y - source.height / 2,
      },
    ).nodes;
    if (source.frameId) {
      const frame = previewScene.getNonDeletedElement(source.frameId);
      const elementsMap = previewScene.getNonDeletedElementsMap();
      if (
        frame &&
        isFrameElement(frame) &&
        this.pendingNodes.every(
          (node) =>
            elementsAreInFrameBounds([node], frame, elementsMap) ||
            elementOverlapsWithFrame(node, frame, elementsMap),
        )
      ) {
        this.pendingNodes = this.pendingNodes.map((node) => ({
          ...node,
          frameId: frame.id,
        }));
      }
    }
    previewScene.destroy();
    this.active = true;
    this.app.triggerRender(true);
  };

  private drop = (event: PointerEvent) => {
    if (!this.gesture || event.pointerId !== this.gesture.pointerId) {
      return;
    }
    const nodes = this.pendingNodes;
    const source = this.app.scene.getNonDeletedElement(this.gesture.source.id);
    const target =
      this.app.ownerDocument.elementFromPoint?.(event.clientX, event.clientY) ??
      event.target;
    const onCanvas = (target as Element | null)?.closest?.(
      ".excalidraw__canvas",
    );
    const valid =
      getFlowchartDragSource(this.app)?.id === this.gesture.source.id;
    this.cancel();
    if (!nodes?.length || !onCanvas || !valid || !source) {
      return;
    }
    this.app.scene.mutateElement(source, {
      boundElements: [
        ...(source.boundElements ?? []),
        { id: nodes[1].id, type: "arrow" },
      ],
    });
    this.app.insertNewElements(nodes);
    this.app.setState((state) => ({
      selectedElementIds: makeNextSelectedElementIds(
        { [nodes[0].id]: true },
        state,
      ),
    }));
    this.app.syncActionResult({
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    this.app.focusContainer();
  };

  private keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    }
  };

  cancel = () => {
    const wasActive = this.active;
    const win = this.app.ownerWindow;
    win.removeEventListener("pointermove", this.move);
    win.removeEventListener("pointerup", this.drop);
    win.removeEventListener("pointercancel", this.cancel);
    win.removeEventListener("blur", this.cancel);
    win.removeEventListener("keydown", this.keyDown, true);
    this.gesture = null;
    this.pendingNodes = null;
    this.active = false;
    if (wasActive) {
      this.app.triggerRender(true);
    }
  };
}

export const FlowchartDragHandles = ({ app }: { app: App }) => {
  const source = getFlowchartDragSource(app);
  if (!source) {
    return null;
  }
  const [x1, y1, x2, y2] = getElementBounds(
    source,
    app.scene.getNonDeletedElementsMap(),
  );
  const directions: {
    direction: LinkDirection;
    x: number;
    y: number;
    symbol: string;
  }[] = [
    { direction: "up", x: (x1 + x2) / 2, y: y1, symbol: "↑" },
    { direction: "right", x: x2, y: (y1 + y2) / 2, symbol: "→" },
    { direction: "down", x: (x1 + x2) / 2, y: y2, symbol: "↓" },
    { direction: "left", x: x1, y: (y1 + y2) / 2, symbol: "←" },
  ];
  return (
    <div
      className="flowchart-drag-handles"
      aria-label="Drag to connect a shape"
    >
      {directions.map(({ direction, x, y, symbol }) => {
        const point = sceneCoordsToViewportCoords(
          { sceneX: x, sceneY: y },
          app.state,
        );
        const dx = direction === "left" ? -30 : direction === "right" ? 30 : 0;
        const dy = direction === "up" ? -30 : direction === "down" ? 30 : 0;
        return (
          <button
            key={direction}
            type="button"
            className="flowchart-drag-handle"
            aria-label={`Drag to create connected shape ${direction}`}
            title={`Drag ${direction} to connect a shape · Escape to cancel`}
            aria-describedby={`${app.id}-flowchart-drag-instructions`}
            style={{
              left: point.x - app.state.offsetLeft + dx,
              top: point.y - app.state.offsetTop + dy,
            }}
            onPointerDown={(event) =>
              app.flowchartDrag.start(source, direction, event)
            }
          >
            {symbol}
          </button>
        );
      })}
      <span
        id={`${app.id}-flowchart-drag-instructions`}
        className="visually-hidden"
      >
        Keyboard alternative: Control or Command plus an arrow key creates a
        connected shape.
      </span>
      {app.flowchartDrag.active && (
        <div className="flowchart-drag-hint" role="status">
          Release to place · Esc to cancel
          <button type="button" onClick={app.flowchartDrag.cancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};
