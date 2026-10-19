import { useRef, useState } from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getCommonBounds } from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";

import { useI18n } from "../i18n";

import "./FlowchartAddStep.scss";

import type App from "./App";

export const FlowchartAddStep = ({ app }: { app: App }) => {
  const node = app.flowchart.contextualNode;
  return node ? <AddStep key={node.id} app={app} /> : null;
};

const AddStep = ({ app }: { app: App }) => {
  const { t } = useI18n();
  const directions: {
    direction: LinkDirection;
    icon: string;
    label: string;
    ariaLabel: string;
  }[] = [
    {
      direction: "up",
      icon: "↑",
      label: t("flowchart.above"),
      ariaLabel: t("flowchart.addStepUp"),
    },
    {
      direction: "right",
      icon: "→",
      label: t("flowchart.right"),
      ariaLabel: t("flowchart.addStepRight"),
    },
    {
      direction: "down",
      icon: "↓",
      label: t("flowchart.below"),
      ariaLabel: t("flowchart.addStepDown"),
    },
    {
      direction: "left",
      icon: "←",
      label: t("flowchart.left"),
      ariaLabel: t("flowchart.addStepLeft"),
    },
  ];
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstDirection = useRef<HTMLButtonElement>(null);
  const node = app.flowchart.contextualNode!;
  const [x1, , x2, y2] = getCommonBounds([node]);
  const { x, y } = sceneCoordsToViewportCoords(
    { sceneX: (x1 + x2) / 2, sceneY: y2 },
    app.state,
  );
  const left = x - app.state.offsetLeft;
  const top = y - app.state.offsetTop + 24;
  // Do not pin a control to the viewport when its shape has been panned away.
  if (left < 0 || left > app.state.width || top < 0 || top > app.state.height) {
    return null;
  }

  return (
    <div
      className="flowchart-add-step"
      style={{
        left: Math.max(105, Math.min(left, app.state.width - 105)),
        top: Math.min(top, app.state.height - (expanded ? 126 : 48)),
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          setExpanded(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="flowchart-add-step__trigger"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) {
            app.ownerWindow.requestAnimationFrame(() =>
              firstDirection.current?.focus(),
            );
          }
        }}
      >
        <span aria-hidden="true">＋</span> {t("flowchart.addStep")}
        <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </button>
      {expanded && (
        <div
          className="flowchart-add-step__directions"
          role="group"
          aria-label={t("flowchart.chooseDirection")}
        >
          {directions.map(({ direction, icon, label, ariaLabel }, index) => (
            <button
              key={direction}
              ref={index === 0 ? firstDirection : undefined}
              type="button"
              aria-label={ariaLabel}
              onClick={() => app.flowchart.addStep(direction)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
