import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getElementBounds, type LinkDirection } from "@excalidraw/element";

import "./FlowchartQuickAdd.scss";

import type App from "./App";

/** Fixed-size buttons follow the selected shape through zooming and panning. */
export const FlowchartQuickAdd = ({ app }: { app: App }) => {
  const node = app.flowchart.quickAddNode;
  if (!node) {
    return null;
  }
  const [x1, y1, x2, y2] = getElementBounds(
    node,
    app.scene.getNonDeletedElementsMap(),
  );
  const start = sceneCoordsToViewportCoords(
    { sceneX: x1, sceneY: y1 },
    app.state,
  );
  const end = sceneCoordsToViewportCoords(
    { sceneX: x2, sceneY: y2 },
    app.state,
  );
  const left = start.x - app.state.offsetLeft;
  const top = start.y - app.state.offsetTop;
  const right = end.x - app.state.offsetLeft;
  const bottom = end.y - app.state.offsetTop;
  const gap = 26;
  const controls: { direction: LinkDirection; x: number; y: number }[] = [
    // Leave the existing rotation handle reachable above the selection.
    { direction: "up", x: (left + right) / 2, y: top - 50 },
    { direction: "right", x: right + gap, y: (top + bottom) / 2 },
    { direction: "down", x: (left + right) / 2, y: bottom + gap },
    { direction: "left", x: left - gap, y: (top + bottom) / 2 },
  ];

  return (
    <div
      className="flowchart-quick-add"
      role="group"
      aria-label="Add connected shape"
    >
      {controls
        .filter(
          ({ x, y }) =>
            x >= 18 &&
            y >= 18 &&
            x <= app.state.width - 18 &&
            y <= app.state.height - 18,
        )
        .map(({ direction, x, y }) => (
          <button
            key={direction}
            type="button"
            className="flowchart-quick-add__button"
            aria-label={`Add connected shape ${direction}`}
            title={`Add connected shape ${direction}`}
            style={{ left: x, top: y }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              app.flowchart.addNode(direction);
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
        ))}
    </div>
  );
};
