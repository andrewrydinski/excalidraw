import React from "react";

import { KEYS, toBrandedType } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, GlobalTestState, render } from "./test-utils";

import type { NormalizedZoomValue } from "../types";

const { h } = window;
const POINTER = { pointerId: 1, pointerType: "mouse", isPrimary: true };
const handle = (direction = "right") =>
  GlobalTestState.renderResult.getByRole("button", {
    name: `Drag to create connected shape ${direction}`,
  });
const live = () => h.elements.filter((element) => !element.isDeleted);
const drag = (direction = "right", x = 600, y = 300) => {
  fireEvent.pointerDown(handle(direction), {
    ...POINTER,
    button: 0,
    clientX: 300,
    clientY: 150,
  });
  fireEvent.pointerMove(window, { ...POINTER, clientX: x, clientY: y });
};
const drop = (target: Element = GlobalTestState.interactiveCanvas) =>
  fireEvent.pointerUp(target, {
    ...POINTER,
    button: 0,
    clientX: 600,
    clientY: 300,
  });
const queryHandles = () =>
  GlobalTestState.renderResult.queryByRole("button", {
    name: /Drag to create/,
  });

describe("flowchart drag handles", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    API.setAppState({ width: 1200, height: 800 });
    const source = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 160,
      height: 100,
      strokeColor: "#e03131",
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
      strokeWidth: 2,
      opacity: 80,
    });
    API.setElements([source]);
    API.setSelectedElements([source]);
    act(() =>
      h.app.syncActionResult({
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }),
    );
  });

  it("previews without changing source bindings, versions, scene or history", () => {
    const source = h.app.scene.getNonDeletedElements()[0];
    const version = source.version;
    const bindings = source.boundElements;
    const historyLength = API.getUndoStack().length;
    drag();
    expect(h.app.flowchartDrag.pendingNodes).toHaveLength(2);
    expect(live()).toHaveLength(1);
    expect(source.version).toBe(version);
    expect(source.boundElements).toBe(bindings);
    expect(API.getUndoStack()).toHaveLength(historyLength);
    fireEvent.keyDown(window, { key: KEYS.ESCAPE });
    drop();
    expect(h.app.flowchartDrag.pendingNodes).toBeNull();
    expect(live()).toHaveLength(1);
    expect(source.version).toBe(version);
  });

  it("places styled, bound geometry as one undoable action and redoes it", () => {
    const source = h.app.scene.getNonDeletedElements()[0];
    drag();
    const [preview] = h.app.flowchartDrag.pendingNodes!;
    drop();
    expect(live()).toHaveLength(3);
    const next = live().find((element) => element.id === preview.id)!;
    const arrow = live().find((element) => element.type === "arrow")!;
    expect(next).toMatchObject({
      x: preview.x,
      y: preview.y,
      type: source.type,
      strokeColor: source.strokeColor,
      backgroundColor: source.backgroundColor,
      fillStyle: source.fillStyle,
      strokeWidth: source.strokeWidth,
      opacity: source.opacity,
    });
    expect(next.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
    expect(source.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
    expect(arrow).toMatchObject({
      elbowed: true,
      startBinding: { elementId: source.id },
      endBinding: { elementId: next.id },
    });
    expect(h.state.selectedElementIds[next.id]).toBe(true);
    Keyboard.undo();
    expect(live()).toHaveLength(1);
    expect(live()[0].boundElements ?? []).toHaveLength(0);
    Keyboard.redo();
    expect(live()).toHaveLength(3);
  });

  it.each(["up", "right", "down", "left"])(
    "previews and places %s",
    (direction) => {
      const source = h.app.scene.getNonDeletedElements()[0];
      drag(direction);
      const [next] = h.app.flowchartDrag.pendingNodes!;
      if (direction === "up") {
        expect(next.y + next.height).toBeLessThan(source.y);
      }
      if (direction === "down") {
        expect(next.y).toBeGreaterThan(source.y + source.height);
      }
      if (direction === "left") {
        expect(next.x + next.width).toBeLessThan(source.x);
      }
      if (direction === "right") {
        expect(next.x).toBeGreaterThan(source.x + source.width);
      }
      drop();
      expect(live()).toHaveLength(3);
    },
  );

  it.each(["pointercancel", "blur", "outside", "button"])(
    "cancels via %s",
    (method) => {
      drag();
      if (method === "outside") {
        drop(document.body);
      } else if (method === "button") {
        fireEvent.click(
          GlobalTestState.renderResult.getByRole("button", { name: "Cancel" }),
        );
      } else {
        fireEvent(window, new Event(method));
      }
      drop();
      expect(h.app.flowchartDrag.pendingNodes).toBeNull();
      expect(live()).toHaveLength(1);
      expect(h.elements[0].boundElements).toBeNull();
    },
  );

  it("does not create on a click without dragging", () => {
    fireEvent.pointerDown(handle(), { ...POINTER, button: 0 });
    drop();
    expect(live()).toHaveLength(1);
  });

  it("hides for unsupported shapes, locked shapes, multi-selection, tools and modes", () => {
    const source = h.app.scene.getNonDeletedElements()[0];
    API.setAppState({ viewModeEnabled: true });
    expect(queryHandles()).toBeNull();
    API.setAppState({
      viewModeEnabled: false,
      activeTool: { ...h.state.activeTool, type: "hand", customType: null },
    });
    expect(queryHandles()).toBeNull();
    API.setAppState({
      activeTool: {
        ...h.state.activeTool,
        type: "selection",
        customType: null,
      },
    });
    const ellipse = API.createElement({ type: "ellipse" });
    API.setElements([source, ellipse]);
    API.setSelectedElements([ellipse]);
    expect(queryHandles()).toBeNull();
    API.setSelectedElements([source, ellipse]);
    expect(queryHandles()).toBeNull();
    const locked = API.createElement({ type: "rectangle", locked: true });
    API.setElements([locked]);
    API.setSelectedElements([locked]);
    expect(queryHandles()).toBeNull();
  });

  it("converts the drop position and handle anchors at zoom and pan", () => {
    API.setAppState({
      zoom: { value: toBrandedType<NormalizedZoomValue>(2) },
      scrollX: 20,
      scrollY: -10,
      offsetLeft: 40,
      offsetTop: 30,
    });
    expect(handle().style.left).toBe("590px");
    expect(handle().style.top).toBe("280px");
    drag("right", 1000, 600);
    const [next] = h.app.flowchartDrag.pendingNodes!;
    expect(next.x).toBe(380);
    expect(next.y).toBe(245);
    drop();
    expect(live()).toHaveLength(3);
  });

  it("moves the target farther out to avoid an unrelated obstacle", () => {
    const source = h.app.scene.getNonDeletedElements()[0];
    const obstacle = API.createElement({
      type: "rectangle",
      x: 500,
      y: 250,
      width: 200,
      height: 100,
    });
    API.setElements([source, obstacle]);
    API.setSelectedElements([source]);
    drag();
    const [next] = h.app.flowchartDrag.pendingNodes!;
    expect(next.x).toBeGreaterThanOrEqual(obstacle.x + obstacle.width + 100);
    drop();
    expect(live()).toHaveLength(4);
  });

  it("creates a blank diamond without copying its bound label", () => {
    const diamond = API.createElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 120,
      height: 100,
    });
    const label = API.createElement({
      type: "text",
      text: "Decision",
      containerId: diamond.id,
    });
    API.setElements([diamond, label]);
    API.updateElement(diamond, {
      boundElements: [{ id: label.id, type: "text" }],
    });
    API.setSelectedElements([diamond]);
    drag();
    const [next] = h.app.flowchartDrag.pendingNodes!;
    expect(next.type).toBe("diamond");
    expect(
      next.boundElements?.every((element) => element.type !== "text"),
    ).toBe(true);
    drop();
    expect(live().filter((element) => element.type === "diamond")).toHaveLength(
      2,
    );
    expect(live().filter((element) => element.type === "text")).toHaveLength(1);
  });
});
