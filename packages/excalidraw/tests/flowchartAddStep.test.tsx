import { fireEvent, screen } from "@testing-library/react";

import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";
import { getNormalizedZoom } from "../scene";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, render } from "./test-utils";

const { h } = window;

beforeEach(async () => {
  localStorage.clear();
  await render(<Excalidraw handleKeyboardGlobally />);
  act(() => h.setState({ width: 1000, height: 1000 }));
});

const selectNode = (type: "rectangle" | "diamond" = "rectangle") => {
  const node = API.createElement({
    type,
    x: 400,
    y: 200,
    width: 120,
    height: 80,
    backgroundColor: "#a5d8ff",
    strokeColor: "#1971c2",
    strokeWidth: 2,
    roughness: 0,
  });
  API.updateScene({
    elements: [node],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  API.setSelectedElements([node]);
  return node;
};

const addStep = (direction: string) => {
  fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
  fireEvent.click(
    screen.getByRole("button", { name: `Add step ${direction}` }),
  );
};

describe("contextual Add step", () => {
  it.each(["up", "right", "down", "left"])(
    "creates a styled, bound successor %s",
    (direction) => {
      const source = selectNode();
      addStep(direction);
      expect(h.elements).toHaveLength(3);
      const child = h.elements.find(
        (el) => el.type === "rectangle" && el.id !== source.id,
      )!;
      expect(child).toMatchObject({
        width: source.width,
        height: source.height,
        backgroundColor: source.backgroundColor,
        strokeColor: source.strokeColor,
        strokeWidth: source.strokeWidth,
        roughness: source.roughness,
      });
      expect(child.boundElements?.some((el) => el.type === "text")).toBeFalsy();
      const arrow = h.elements.find((el) => el.type === "arrow")!;
      expect(arrow).toMatchObject({
        elbowed: true,
        startBinding: { elementId: source.id },
        endBinding: { elementId: child.id },
      });
      expect(h.state.selectedElementIds[child.id]).toBe(true);
      if (direction === "right") {
        expect(child.x).toBeGreaterThan(source.x + source.width);
      } else if (direction === "left") {
        expect(child.x + child.width).toBeLessThan(source.x);
      } else if (direction === "up") {
        expect(child.y + child.height).toBeLessThan(source.y);
      } else {
        expect(child.y).toBeGreaterThan(source.y + source.height);
      }
    },
  );

  it("preserves diamonds and supports atomic undo and redo", async () => {
    selectNode("diamond");
    addStep("down");
    expect(h.elements.filter((el) => el.type === "diamond")).toHaveLength(2);
    await act(async () => Keyboard.undo());
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(1);
    await act(async () => Keyboard.redo());
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(3);
  });

  it("creates a blank step rather than duplicating the source label", () => {
    const source = selectNode();
    const label = API.createElement({
      type: "text",
      text: "Original label",
      containerId: source.id,
    });
    API.updateElement(source, {
      boundElements: [{ type: "text", id: label.id }],
    });
    API.setElements([source, label]);
    addStep("right");
    expect(h.elements.filter((el) => el.type === "text")).toEqual([label]);
    const child = h.elements.find(
      (el) => el.type === "rectangle" && el.id !== source.id,
    )!;
    expect(child.boundElements?.some((el) => el.type === "text")).toBeFalsy();
  });

  it("opens accessible direction buttons and closes without creating on Escape", () => {
    selectNode();
    const trigger = screen.getByRole("button", { name: /Add step/ });
    fireEvent.click(trigger);
    const up = screen.getByRole("button", { name: "Add step up" });
    fireEvent.keyDown(up, { key: "Escape" });
    expect(
      screen.queryByRole("group", { name: /Choose next step/ }),
    ).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(h.elements).toHaveLength(1);
  });

  it("hides for locked, multiple, and unsupported selections", () => {
    const locked = API.createElement({ type: "rectangle", locked: true });
    const ellipse = API.createElement({ type: "ellipse" });
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([locked, ellipse, rectangle]);
    for (const selection of [[locked], [ellipse], [rectangle, ellipse], []]) {
      API.setSelectedElements(selection);
      expect(screen.queryByRole("button", { name: /Add step/ })).toBeNull();
    }
  });

  it("hides while editing, drawing, dragging, resizing, rotating, or viewing", () => {
    selectNode();
    const hiddenStates = [
      { viewModeEnabled: true },
      { zenModeEnabled: true },
      { selectedElementsAreBeingDragged: true },
      { isResizing: true },
      { isRotating: true },
      {
        editingTextElement: API.createElement({ type: "text", text: "Label" }),
      },
      {
        activeTool: {
          ...h.state.activeTool,
          type: "rectangle" as const,
          customType: null,
        },
      },
    ];
    for (const state of hiddenStates) {
      const original = h.state;
      act(() => h.setState({ ...original, ...state }));
      expect(screen.queryByRole("button", { name: /Add step/ })).toBeNull();
      act(() => h.setState(original));
    }
  });

  it("keeps placement in sync with zoom and pan", () => {
    selectNode();
    const position = () =>
      screen.getByRole("button", { name: /Add step/ }).parentElement!.style
        .left;
    const initial = position();
    act(() => h.setState({ scrollX: h.state.scrollX + 100 }));
    expect(position()).not.toBe(initial);
    const panned = position();
    act(() => h.setState({ zoom: { value: getNormalizedZoom(1.5) } }));
    expect(position()).not.toBe(panned);
  });
});
