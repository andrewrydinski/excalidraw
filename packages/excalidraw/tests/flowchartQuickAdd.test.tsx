import { act, fireEvent, screen } from "@testing-library/react";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, UI } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally />);
  act(() => h.app.setState({ width: 1200, height: 900 }));
});

const selectNode = (type: "rectangle" | "diamond" = "rectangle") => {
  const node = API.createElement({
    type,
    x: 400,
    y: 300,
    width: 150,
    height: 90,
    strokeColor: "#1971c2",
    backgroundColor: "#a5d8ff",
    fillStyle: "solid",
    strokeWidth: 2,
  });
  API.setElements([node]);
  API.setSelectedElements([node]);
  return node;
};

const add = (direction: LinkDirection) =>
  fireEvent.click(
    screen.getByRole("button", { name: `Add connected shape ${direction}` }),
  );

describe("directional flowchart quick add", () => {
  it.each(["up", "right", "down", "left"] as const)(
    "adds one styled node and bound elbow connector %s",
    (direction) => {
      const parent = selectNode();
      add(direction);
      const child = h.elements.find(
        (element) => element.type === "rectangle" && element.id !== parent.id,
      )!;
      const arrow = h.elements.find((element) => element.type === "arrow")!;
      expect(h.elements).toHaveLength(3);
      expect(child).toMatchObject({
        width: parent.width,
        height: parent.height,
        strokeColor: parent.strokeColor,
        backgroundColor: parent.backgroundColor,
        fillStyle: parent.fillStyle,
        strokeWidth: parent.strokeWidth,
      });
      expect(arrow).toMatchObject({
        elbowed: true,
        startBinding: { elementId: parent.id },
        endBinding: { elementId: child.id },
      });
      expect(h.state.selectedElementIds).toEqual({ [child.id]: true });
      if (direction === "up") {
        expect(child.y + child.height).toBeLessThan(parent.y);
      } else if (direction === "down") {
        expect(child.y).toBeGreaterThan(parent.y + parent.height);
      } else if (direction === "left") {
        expect(child.x + child.width).toBeLessThan(parent.x);
      } else {
        expect(child.x).toBeGreaterThan(parent.x + parent.width);
      }
    },
  );

  it("adds a diamond without copying its existing label", () => {
    const parent = selectNode("diamond");
    const text = API.createElement({
      type: "text",
      text: "Existing decision",
      containerId: parent.id,
    });
    API.setElements([
      { ...parent, boundElements: [{ id: text.id, type: "text" }] },
      text,
    ]);
    API.setSelectedElements([parent]);
    add("right");
    expect(
      h.elements.filter((element) => element.type === "text"),
    ).toHaveLength(1);
    expect(
      h.elements.filter((element) => element.type === "diamond"),
    ).toHaveLength(2);
  });

  it("undoes and redoes the node and connector as one operation", () => {
    selectNode();
    act(() => {
      h.app.syncActionResult({
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    });
    add("right");
    expect(h.app.scene.getNonDeletedElements()).toHaveLength(3);
    Keyboard.undo();
    expect(h.app.scene.getNonDeletedElements()).toHaveLength(1);
    Keyboard.redo();
    expect(h.app.scene.getNonDeletedElements()).toHaveLength(3);
  });

  it("hides for locked, multi-selected, unsupported shapes and other tools", () => {
    const parent = selectNode();
    expect(
      screen.getByRole("group", { name: "Add connected shape" }),
    ).toBeTruthy();
    API.setElements([{ ...parent, locked: true }]);
    expect(
      screen.queryByRole("group", { name: "Add connected shape" }),
    ).toBeNull();
    const ellipse = API.createElement({ type: "ellipse" });
    API.setElements([parent, ellipse]);
    API.setSelectedElements([parent, ellipse]);
    expect(
      screen.queryByRole("group", { name: "Add connected shape" }),
    ).toBeNull();
    API.setSelectedElements([ellipse]);
    expect(
      screen.queryByRole("group", { name: "Add connected shape" }),
    ).toBeNull();
    API.setSelectedElements([parent]);
    UI.clickTool("arrow");
    expect(
      screen.queryByRole("group", { name: "Add connected shape" }),
    ).toBeNull();
  });

  it("hides while dragging, resizing, viewing read-only or using a dialog", () => {
    const parent = selectNode();
    for (const state of [
      { viewModeEnabled: true },
      { selectedElementsAreBeingDragged: true },
      { resizingElement: parent },
      { openDialog: { name: "help" as const } },
    ]) {
      act(() => h.app.setState((previous) => ({ ...previous, ...state })));
      expect(
        screen.queryByRole("group", { name: "Add connected shape" }),
      ).toBeNull();
      act(() =>
        h.app.setState({
          viewModeEnabled: false,
          selectedElementsAreBeingDragged: false,
          resizingElement: null,
          openDialog: null,
        }),
      );
    }
  });

  it("keeps button size fixed while positions track zoom and pan", () => {
    selectNode();
    const button = screen.getByRole("button", {
      name: "Add connected shape right",
    });
    const before = parseFloat(button.style.left);
    act(() => h.app.setState({ scrollX: h.state.scrollX + 100 }));
    expect(parseFloat(button.style.left)).toBeCloseTo(before + 100);
    act(() =>
      h.app.setState({ zoom: { value: 0.5 as typeof h.state.zoom.value } }),
    );
    expect(parseFloat(button.style.left)).not.toBeCloseTo(before + 100);
    expect(button.style.transform).toBe("");
  });
});
