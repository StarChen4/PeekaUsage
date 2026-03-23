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

export const MIN_WINDOW_WIDTH = 220;
export const MIN_WINDOW_HEIGHT = 200;

const WINDOW_SIZE_EPSILON = 1;
const WINDOW_SCREEN_MARGIN = 16;
const WINDOW_POSITION_SENTINEL_THRESHOLD = 10000;
const PROGRAMMATIC_RESIZE_HOLD_MS = 400;
const MANUAL_RESIZE_SUPPRESSION_MS = 600;

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
