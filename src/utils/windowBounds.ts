import { LogicalSize, currentMonitor, getCurrentWindow, type Monitor } from "@tauri-apps/api/window";
import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";

export type LogicalWindowSize = {
  width: number;
  height: number;
};

export type LogicalWindowPosition = {
  x: number;
  y: number;
};

export type WindowDockEdge = "left" | "right";

export type WindowDockBounds = {
  edge: WindowDockEdge;
  expandedPosition: LogicalWindowPosition;
  expandedSize: LogicalWindowSize;
  collapsedPosition: LogicalWindowPosition;
  collapsedSize: LogicalWindowSize;
};

type ResolveWindowDockBoundsOptions = {
  requireExceeded?: boolean;
};

export const MIN_WINDOW_WIDTH = 220;
export const MIN_WINDOW_HEIGHT = 200;
export const EDGE_DOCK_COLLAPSED_WIDTH = 16;
export const EDGE_DOCK_COLLAPSED_HEIGHT_MIN = 96;
export const EDGE_DOCK_COLLAPSED_HEIGHT_MAX = 136;

const WINDOW_SIZE_EPSILON = 1;
const WINDOW_SCREEN_MARGIN = 16;
const WINDOW_POSITION_SENTINEL_THRESHOLD = 10000;
const PROGRAMMATIC_RESIZE_HOLD_MS = 400;
const MANUAL_RESIZE_SUPPRESSION_MS = 600;
const EDGE_DOCK_TRIGGER_DISTANCE = 28;
const EDGE_DOCK_RESIZE_ESCAPE_PX = 48;
const EDGE_DOCK_RESIZE_ESCAPE_RATIO = 0.18;

let programmaticResizeUntil = 0;
let suppressAutoFitUntil = 0;

function roundWindowValue(value: number) {
  return Math.round(value);
}

function now() {
  return Date.now();
}

export function markProgrammaticWindowResize() {
  programmaticResizeUntil = now() + PROGRAMMATIC_RESIZE_HOLD_MS;
}

export function isProgrammaticWindowResize() {
  return programmaticResizeUntil > now();
}

export function markProgrammaticWindowMove() {
  markProgrammaticWindowResize();
}

export function isProgrammaticWindowMove() {
  return isProgrammaticWindowResize();
}

export function suppressAutoFitAfterManualResize() {
  suppressAutoFitUntil = now() + MANUAL_RESIZE_SUPPRESSION_MS;
}

export function shouldSuppressAutoFit() {
  return suppressAutoFitUntil > now();
}

export function normalizeWindowSize(
  size: LogicalWindowSize | null | undefined,
): LogicalWindowSize | null {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return null;
  }

  return {
    width: Math.max(MIN_WINDOW_WIDTH, roundWindowValue(size.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, roundWindowValue(size.height)),
  };
}

export function normalizeWindowPosition(
  position: LogicalWindowPosition | null | undefined,
): LogicalWindowPosition | null {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return null;
  }

  // Windows 在窗口隐藏或最小化时可能上报离屏哨兵值，例如 -21845。
  if (
    Math.abs(position.x) >= WINDOW_POSITION_SENTINEL_THRESHOLD
    || Math.abs(position.y) >= WINDOW_POSITION_SENTINEL_THRESHOLD
  ) {
    return null;
  }

  return {
    x: roundWindowValue(position.x),
    y: roundWindowValue(position.y),
  };
}

export function areWindowSizesEqual(
  left: LogicalWindowSize | null | undefined,
  right: LogicalWindowSize | null | undefined,
) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return Math.abs(left.width - right.width) <= WINDOW_SIZE_EPSILON
    && Math.abs(left.height - right.height) <= WINDOW_SIZE_EPSILON;
}

export function wasLikelyResizedBySystemSnap(
  start: LogicalWindowSize | null | undefined,
  current: LogicalWindowSize | null | undefined,
) {
  if (!start || !current) {
    return false;
  }

  const widthDelta = Math.abs(current.width - start.width);
  const heightDelta = Math.abs(current.height - start.height);
  const widthRatio = start.width <= 0 ? 0 : widthDelta / start.width;
  const heightRatio = start.height <= 0 ? 0 : heightDelta / start.height;

  return widthDelta >= EDGE_DOCK_RESIZE_ESCAPE_PX
    || heightDelta >= EDGE_DOCK_RESIZE_ESCAPE_PX
    || widthRatio >= EDGE_DOCK_RESIZE_ESCAPE_RATIO
    || heightRatio >= EDGE_DOCK_RESIZE_ESCAPE_RATIO;
}

export function areWindowPositionsEqual(
  left: LogicalWindowPosition | null | undefined,
  right: LogicalWindowPosition | null | undefined,
) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return Math.abs(left.x - right.x) <= WINDOW_SIZE_EPSILON
    && Math.abs(left.y - right.y) <= WINDOW_SIZE_EPSILON;
}

export function toLogicalWindowSize(size: PhysicalSize, scaleFactor: number): LogicalWindowSize {
  const logical = size.toLogical(scaleFactor);
  return normalizeWindowSize(logical) ?? {
    width: MIN_WINDOW_WIDTH,
    height: MIN_WINDOW_HEIGHT,
  };
}

export function toLogicalWindowPosition(
  position: PhysicalPosition,
  scaleFactor: number,
): LogicalWindowPosition | null {
  const logical = position.toLogical(scaleFactor);
  return normalizeWindowPosition(logical);
}

function getMaxWindowHeight(monitor: Monitor | null) {
  if (!monitor) {
    return null;
  }

  const logicalHeight = monitor.workArea.size.toLogical(monitor.scaleFactor).height;
  return Math.max(MIN_WINDOW_HEIGHT, roundWindowValue(logicalHeight - WINDOW_SCREEN_MARGIN));
}

export async function fitCurrentWindowHeight(targetHeight: number) {
  if (!Number.isFinite(targetHeight)) {
    return false;
  }

  const appWindow = getCurrentWindow();
  const [scaleFactor, innerSize, monitor] = await Promise.all([
    appWindow.scaleFactor(),
    appWindow.innerSize(),
    currentMonitor(),
  ]);
  const currentLogicalSize = innerSize.toLogical(scaleFactor);
  const maxHeight = getMaxWindowHeight(monitor);
  const desiredHeight = Math.max(MIN_WINDOW_HEIGHT, Math.ceil(targetHeight));
  const clampedHeight = maxHeight == null ? desiredHeight : Math.min(desiredHeight, maxHeight);

  if (Math.abs(clampedHeight - currentLogicalSize.height) <= WINDOW_SIZE_EPSILON) {
    return false;
  }

  markProgrammaticWindowResize();
  await appWindow.setSize(new LogicalSize(currentLogicalSize.width, clampedHeight));
  return true;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function getLogicalMonitorWorkArea(monitor: Monitor) {
  const position = monitor.workArea.position.toLogical(monitor.scaleFactor);
  const size = monitor.workArea.size.toLogical(monitor.scaleFactor);

  return {
    x: roundWindowValue(position.x),
    y: roundWindowValue(position.y),
    width: Math.max(MIN_WINDOW_WIDTH, roundWindowValue(size.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, roundWindowValue(size.height)),
  };
}

function getCollapsedHeight(expandedHeight: number, workAreaHeight: number) {
  return clamp(
    Math.round(expandedHeight * 0.54),
    EDGE_DOCK_COLLAPSED_HEIGHT_MIN,
    Math.min(EDGE_DOCK_COLLAPSED_HEIGHT_MAX, workAreaHeight),
  );
}

export async function resolveWindowDockBounds(
  position: LogicalWindowPosition,
  size: LogicalWindowSize,
  options?: ResolveWindowDockBoundsOptions,
): Promise<WindowDockBounds | null> {
  const monitor = await currentMonitor();
  if (!monitor) {
    return null;
  }

  return resolveWindowDockBoundsForMonitor(position, size, monitor, options);
}

export function resolveWindowDockBoundsForMonitor(
  position: LogicalWindowPosition,
  size: LogicalWindowSize,
  monitor: Monitor,
  options?: ResolveWindowDockBoundsOptions,
): WindowDockBounds | null {
  const workArea = getLogicalMonitorWorkArea(monitor);
  const rawPosition = {
    x: roundWindowValue(position.x),
    y: roundWindowValue(position.y),
  };
  const expandedSize = {
    width: clamp(roundWindowValue(size.width), MIN_WINDOW_WIDTH, workArea.width),
    height: clamp(roundWindowValue(size.height), MIN_WINDOW_HEIGHT, workArea.height),
  };
  const maxX = workArea.x + workArea.width - expandedSize.width;
  const maxY = workArea.y + workArea.height - expandedSize.height;
  const clampedPosition = {
    x: clamp(roundWindowValue(position.x), workArea.x, maxX),
    y: clamp(roundWindowValue(position.y), workArea.y, maxY),
  };
  const exceededEdges = [
    {
      edge: "left" as WindowDockEdge,
      overflow: workArea.x - rawPosition.x,
    },
    {
      edge: "right" as WindowDockEdge,
      overflow: rawPosition.x + expandedSize.width - (workArea.x + workArea.width),
    },
  ]
    .filter((item) => item.overflow > 0)
    .sort((left, right) => right.overflow - left.overflow);
  const nearbyEdges = [
    {
      edge: "left" as WindowDockEdge,
      distance: Math.abs(clampedPosition.x - workArea.x),
    },
    {
      edge: "right" as WindowDockEdge,
      distance: Math.abs(clampedPosition.x + expandedSize.width - (workArea.x + workArea.width)),
    },
  ]
    .filter((item) => item.distance <= EDGE_DOCK_TRIGGER_DISTANCE)
    .sort((left, right) => left.distance - right.distance);

  const winner = options?.requireExceeded ? exceededEdges[0] : nearbyEdges[0];
  if (!winner) {
    return null;
  }

  switch (winner.edge) {
    case "left": {
      const collapsedHeight = getCollapsedHeight(expandedSize.height, workArea.height);
      const expandedCenterY = clampedPosition.y + expandedSize.height / 2;
      const collapsedY = clamp(
        roundWindowValue(expandedCenterY - collapsedHeight / 2),
        workArea.y,
        workArea.y + workArea.height - collapsedHeight,
      );

      return {
        edge: "left",
        expandedPosition: {
          x: workArea.x,
          y: clampedPosition.y,
        },
        expandedSize,
        collapsedPosition: {
          x: workArea.x,
          y: collapsedY,
        },
        collapsedSize: {
          width: EDGE_DOCK_COLLAPSED_WIDTH,
          height: collapsedHeight,
        },
      };
    }
    case "right": {
      const collapsedHeight = getCollapsedHeight(expandedSize.height, workArea.height);
      const expandedCenterY = clampedPosition.y + expandedSize.height / 2;
      const collapsedY = clamp(
        roundWindowValue(expandedCenterY - collapsedHeight / 2),
        workArea.y,
        workArea.y + workArea.height - collapsedHeight,
      );

      return {
        edge: "right",
        expandedPosition: {
          x: workArea.x + workArea.width - expandedSize.width,
          y: clampedPosition.y,
        },
        expandedSize,
        collapsedPosition: {
          x: workArea.x + workArea.width - EDGE_DOCK_COLLAPSED_WIDTH,
          y: collapsedY,
        },
        collapsedSize: {
          width: EDGE_DOCK_COLLAPSED_WIDTH,
          height: collapsedHeight,
        },
      };
    }
  }
}
