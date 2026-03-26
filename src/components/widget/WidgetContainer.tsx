import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../../i18n";
import { THEME_OPTION_ORDER } from "../../i18n/messages";
import { useProviders } from "../../composables/useProviders";
import { useProviderStore } from "../../stores/providerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUpdateStore } from "../../stores/updateStore";
import type { ProviderId, UsageSummary } from "../../types/provider";
import type { ThemeMode } from "../../types/settings";
import { saveProviderOrder } from "../../utils/ipc";
import { fitCurrentWindowHeight, shouldSuppressAutoFit } from "../../utils/windowBounds";
import OpacityHandle from "./OpacityHandle";
import ProviderCard from "./ProviderCard";

type WidgetContainerProps = {
  onOpenSettings: () => void;
  suppressWindowAutoFit?: boolean;
};

type DragSlot = {
  id: ProviderId;
  top: number;
  height: number;
};

type DragState = {
  providerId: ProviderId;
  pointerId: number;
  startClientY: number;
  startScrollTop: number;
  deltaY: number;
  originIndex: number;
  targetIndex: number;
  slots: DragSlot[];
  releasing: boolean;
};

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return [...items];
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export default function WidgetContainer({
  onOpenSettings,
  suppressWindowAutoFit = false,
}: WidgetContainerProps) {
  const { t } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const hasUpdate = useUpdateStore((state) => state.hasUpdate);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const { providers, isRefreshing, manualRefresh, manualRefreshProvider } = useProviders();
  const [orderedProviders, setOrderedProviders] = useState<UsageSummary[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [layoutSaveState, setLayoutSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const cardListContentRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const themeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRefs = useRef(new Map<ProviderId, HTMLDivElement>());
  const orderedProvidersRef = useRef<UsageSummary[]>([]);
  const dragStateRef = useRef<DragState | null>(null);
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers],
  );
  const isDragging = !!dragState && !dragState.releasing;
  const themeOptions = THEME_OPTION_ORDER.map((value) => ({
    value,
    label: t(`widget.theme.${value}`),
  }));
  const contentLayoutKey = useMemo(
    () => JSON.stringify({
      displayMode: settings.widgetDisplayMode,
      compactColorMarkersEnabled: settings.compactColorMarkersEnabled,
      language: settings.language,
      providers: orderedProviders.map((provider) => ({
        providerId: provider.providerId,
        status: provider.status,
        errorMessage: provider.errorMessage ?? "",
        subscriptions: provider.subscriptions.map((subscription) => ({
          subscriptionId: subscription.subscriptionId,
          status: subscription.usage.status,
          windows: subscription.usage.windows.map((window) => ({
            label: window.label,
            utilization: Math.round(window.utilization),
          })),
        })),
        apiKeys: provider.apiKeyUsages.map((item) => ({
          keyId: item.keyId,
          keyName: item.keyName,
          color: item.color,
          status: item.status,
          hasUsage: !!item.usage,
          hasError: !!item.errorMessage,
        })),
      })),
    }),
    [orderedProviders, settings.compactColorMarkersEnabled, settings.language, settings.widgetDisplayMode],
  );
  const layoutStatusText = layoutSaveState === "saving"
    ? t("widget.layout.saving")
    : layoutSaveState === "saved"
      ? t("widget.layout.saved")
      : layoutSaveState === "error"
        ? t("widget.layout.error")
        : orderedProviders.length > 1
          ? t("widget.layout.hint")
          : "";

  function clearSaveFeedbackTimer() {
    if (saveFeedbackTimerRef.current) {
      clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
  }

  function syncOrderedProviders(nextProviders: UsageSummary[]) {
    const providerMap = new Map(nextProviders.map((provider) => [provider.providerId, provider]));
    const merged: UsageSummary[] = [];

    for (const provider of orderedProvidersRef.current) {
      const next = providerMap.get(provider.providerId);
      if (next) {
        merged.push(next);
        providerMap.delete(provider.providerId);
      }
    }

    for (const provider of nextProviders) {
      if (providerMap.has(provider.providerId)) {
        merged.push(provider);
        providerMap.delete(provider.providerId);
      }
    }

    setOrderedProviders(merged);
  }

  function getDragSlots(): DragSlot[] {
    const listEl = cardListRef.current;
    if (!listEl) {
      return [];
    }

    const listRect = listEl.getBoundingClientRect();
    const scrollTop = listEl.scrollTop;

    return orderedProvidersRef.current
      .map((provider) => {
        const element = cardRefs.current.get(provider.providerId);
        if (!element) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        return {
          id: provider.providerId,
          top: rect.top - listRect.top + scrollTop,
          height: rect.height,
        };
      })
      .filter((slot): slot is DragSlot => slot !== null);
  }

  function getTargetIndex(slots: DragSlot[], draggedId: ProviderId, draggedCenter: number) {
    let index = 0;

    for (const slot of slots) {
      if (slot.id === draggedId) {
        continue;
      }

      if (draggedCenter > slot.top + slot.height / 2) {
        index += 1;
      }
    }

    return index;
  }

  function autoScrollList(clientY: number) {
    const listEl = cardListRef.current;
    if (!listEl) {
      return;
    }

    const rect = listEl.getBoundingClientRect();
    const threshold = 56;
    const maxStep = 18;

    if (clientY < rect.top + threshold) {
      const distance = rect.top + threshold - clientY;
      listEl.scrollTop -= Math.min(maxStep, distance * 0.45);
    } else if (clientY > rect.bottom - threshold) {
      const distance = clientY - (rect.bottom - threshold);
      listEl.scrollTop += Math.min(maxStep, distance * 0.45);
    }
  }

  async function persistProviderOrder(order: ProviderId[]) {
    clearSaveFeedbackTimer();
    setLayoutSaveState("saving");

    try {
      await saveProviderOrder(order);
      setLayoutSaveState("saved");
    } catch {
      setLayoutSaveState("error");
    }

    saveFeedbackTimerRef.current = setTimeout(() => {
      setLayoutSaveState("idle");
      saveFeedbackTimerRef.current = null;
    }, 2200);
  }

  async function releaseDrag(commit: boolean) {
    const currentDrag = dragStateRef.current;
    if (!currentDrag) {
      return;
    }

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    if (!commit) {
      setDragState(null);
      return;
    }

    const movedProviders = moveItem(orderedProvidersRef.current, currentDrag.originIndex, currentDrag.targetIndex);
    const finalOffset = currentDrag.slots[currentDrag.targetIndex].top - currentDrag.slots[currentDrag.originIndex].top;

    setDragState({
      ...currentDrag,
      deltaY: finalOffset,
      releasing: true,
    });

    window.setTimeout(() => {
      setOrderedProviders(movedProviders);
      setDragState(null);

      if (currentDrag.originIndex !== currentDrag.targetIndex) {
        void persistProviderOrder(movedProviders.map((provider) => provider.providerId));
      }
    }, 180);
  }

  function handlePointerMove(event: PointerEvent) {
    const currentDrag = dragStateRef.current;
    const listEl = cardListRef.current;
    if (!currentDrag || currentDrag.releasing || !listEl || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    autoScrollList(event.clientY);

    const scrollOffset = listEl.scrollTop - currentDrag.startScrollTop;
    const deltaY = event.clientY - currentDrag.startClientY + scrollOffset;
    const draggedSlot = currentDrag.slots[currentDrag.originIndex];
    const draggedCenter = draggedSlot.top + deltaY + draggedSlot.height / 2;
    const targetIndex = getTargetIndex(currentDrag.slots, currentDrag.providerId, draggedCenter);

    setDragState({
      ...currentDrag,
      deltaY,
      targetIndex,
    });
  }

  function handlePointerUp(event: PointerEvent) {
    const currentDrag = dragStateRef.current;
    if (!currentDrag || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    void releaseDrag(true);
  }

  function handlePointerCancel(event: PointerEvent) {
    const currentDrag = dragStateRef.current;
    if (!currentDrag || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    void releaseDrag(false);
  }

  function startDrag(providerId: ProviderId, event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || orderedProvidersRef.current.length < 2) {
      return;
    }

    setIsThemeMenuOpen(false);

    const slots = getDragSlots();
    const originIndex = orderedProvidersRef.current.findIndex((provider) => provider.providerId === providerId);
    const listEl = cardListRef.current;

    if (!listEl || slots.length !== orderedProvidersRef.current.length || originIndex < 0) {
      return;
    }

    clearSaveFeedbackTimer();
    setLayoutSaveState("idle");
    setDragState({
      providerId,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startScrollTop: listEl.scrollTop,
      deltaY: 0,
      originIndex,
      targetIndex: originIndex,
      slots,
      releasing: false,
    });

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function getCardTransform(providerId: ProviderId) {
    const currentDrag = dragStateRef.current;
    if (!currentDrag) {
      return undefined;
    }

    const currentOrder = orderedProvidersRef.current.map((provider) => provider.providerId);
    const originalIndex = currentOrder.indexOf(providerId);
    if (originalIndex < 0) {
      return undefined;
    }

    if (providerId === currentDrag.providerId) {
      return `translate3d(0, ${currentDrag.deltaY}px, 0) scale(1.02)`;
    }

    const nextOrder = moveItem(currentOrder, currentDrag.originIndex, currentDrag.targetIndex);
    const nextIndex = nextOrder.indexOf(providerId);

    if (nextIndex === originalIndex) {
      return undefined;
    }

    return `translate3d(0, ${currentDrag.slots[nextIndex].top - currentDrag.slots[originalIndex].top}px, 0)`;
  }

  function getCardStyle(providerId: ProviderId): CSSProperties | undefined {
    const currentDrag = dragStateRef.current;
    const transform = getCardTransform(providerId);

    if (!currentDrag) {
      return undefined;
    }

    return {
      transform,
      zIndex: providerId === currentDrag.providerId ? 3 : 1,
      transition: providerId === currentDrag.providerId && !currentDrag.releasing
        ? "none"
        : "transform 180ms cubic-bezier(0.2, 0.85, 0.25, 1)",
    };
  }

  function getCardClass(providerId: ProviderId) {
    const currentDrag = dragStateRef.current;
    return [
      "card-shell",
      currentDrag?.providerId === providerId ? "is-dragging" : "",
      currentDrag && currentDrag.providerId !== providerId && getCardTransform(providerId) ? "is-shifting" : "",
    ].filter(Boolean).join(" ");
  }

  useEffect(() => {
    orderedProvidersRef.current = orderedProviders;
  }, [orderedProviders]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!dragStateRef.current) {
      syncOrderedProviders(enabledProviders);
    }
  }, [enabledProviders, dragState]);

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (!isThemeMenuOpen) {
        return;
      }

      const target = event.target as Node | null;
      if (!target) {
        setIsThemeMenuOpen(false);
        return;
      }

      const clickedMenu = themeMenuRef.current?.contains(target) ?? false;
      const clickedTrigger = themeTriggerRef.current?.contains(target) ?? false;

      if (!clickedMenu && !clickedTrigger) {
        setIsThemeMenuOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsThemeMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      clearSaveFeedbackTimer();
    };
  }, [isThemeMenuOpen]);

  useEffect(() => {
    if (suppressWindowAutoFit) {
      return;
    }

    if (!settings.autoExpandWindowToFitContent) {
      return;
    }

    if (shouldSuppressAutoFit()) {
      return;
    }

    let frameId = 0;

    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        const cardListEl = cardListRef.current;
        const cardListContentEl = cardListContentRef.current;
        if (!cardListEl || !cardListContentEl) {
          return;
        }

        const titleBarHeight = document.querySelector<HTMLElement>(".titlebar")?.offsetHeight ?? 0;
        const footerHeight = footerRef.current?.offsetHeight ?? 0;
        const appChromeHeight = (() => {
          const appEl = document.getElementById("app");
          return appEl ? appEl.offsetHeight - appEl.clientHeight : 0;
        })();
        const cardListStyle = window.getComputedStyle(cardListEl);
        const cardListPaddingY = Number.parseFloat(cardListStyle.paddingTop || "0")
          + Number.parseFloat(cardListStyle.paddingBottom || "0");
        const desiredHeight = titleBarHeight
          + footerHeight
          + appChromeHeight
          + cardListPaddingY
          + cardListContentEl.offsetHeight;

        void fitCurrentWindowHeight(desiredHeight);
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    suppressWindowAutoFit,
    settings.autoExpandWindowToFitContent,
    contentLayoutKey,
  ]);

  return (
    <div className="widget-container">
      <div ref={cardListRef} className={`card-list${isDragging ? " is-dragging" : ""}`}>
        <div
          ref={cardListContentRef}
          className={`card-list-content${orderedProviders.length === 0 ? " is-empty" : ""}`}
        >
          {orderedProviders.length > 0 ? (
            orderedProviders.map((provider) => (
              <div
                key={provider.providerId}
                ref={(element) => {
                  if (element) {
                    cardRefs.current.set(provider.providerId, element);
                  } else {
                    cardRefs.current.delete(provider.providerId);
                  }
                }}
                className={getCardClass(provider.providerId)}
                style={getCardStyle(provider.providerId)}
                onPointerDown={(event) => startDrag(provider.providerId, event)}
              >
                <ProviderCard
                  provider={provider}
                  displayMode={settings.widgetDisplayMode}
                  useCompactColorMarkers={settings.compactColorMarkersEnabled}
                  isRefreshing={useProviderStore.getState().isProviderRefreshing(provider.providerId)}
                  onRefresh={() => void manualRefreshProvider(provider.providerId)}
                />
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>{t("widget.emptyState.title")}</p>
              <button className="btn-link" onClick={onOpenSettings}>{t("widget.emptyState.action")}</button>
            </div>
          )}
        </div>
      </div>

      <div ref={footerRef} className="widget-footer">
        {layoutStatusText && (
          <span className={`layout-status is-${layoutSaveState}`}>
            {layoutStatusText}
          </span>
        )}

        <div className="footer-actions">
          <button
            className={`icon-btn${settings.widgetDisplayMode === "compact" ? " is-active" : ""}`}
            title={settings.widgetDisplayMode === "compact"
              ? t("widget.actions.disableCompactMode")
              : t("widget.actions.enableCompactMode")}
            aria-label={settings.widgetDisplayMode === "compact"
              ? t("widget.actions.disableCompactMode")
              : t("widget.actions.enableCompactMode")}
            aria-pressed={settings.widgetDisplayMode === "compact"}
            onClick={() => void saveSettings({
              widgetDisplayMode: settings.widgetDisplayMode === "compact" ? "detailed" : "compact",
            })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 7.5h14M5 12h14M5 16.5h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <path
                d="M5 7.5h4M5 12h8M5 16.5h6"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="3"
              />
            </svg>
          </button>

          <div className="theme-picker">
            <button
              ref={themeTriggerRef}
              className={`icon-btn${isThemeMenuOpen ? " is-active" : ""}`}
              title={t("widget.actions.theme")}
              onClick={() => setIsThemeMenuOpen((value) => !value)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M8.2 5.2 10.1 7h3.8l1.9-1.8 3.6 2.1-1.7 3-1.8-1V19H8.1V9.3l-1.8 1-1.7-3 3.6-2.1Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M10.2 7.1 12 9l1.8-1.9"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M10 12h4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.7"
                />
              </svg>
            </button>

            {isThemeMenuOpen && (
              <div ref={themeMenuRef} className="theme-menu">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`theme-option${settings.theme === option.value ? " is-selected" : ""}`}
                    title={option.label}
                    aria-label={option.label}
                    onClick={() => void saveSettings({ theme: option.value as ThemeMode }).then(() => setIsThemeMenuOpen(false))}
                  >
                    <span className="theme-option-icon">
                      {option.value === "light" ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          <path
                            d="M12 2.5V5.1M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.72 5.28l-1.84 1.84M7.12 16.88l-1.84 1.84M18.72 18.72l-1.84-1.84M7.12 7.12L5.28 5.28"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      ) : option.value === "dark" ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M19 14.5A7.5 7.5 0 0 1 9.5 5a8.5 8.5 0 1 0 9.5 9.5Z"
                            fill="none"
                            stroke="currentColor"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M9 19h6M12 16v3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                        </svg>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`icon-btn pin-icon-btn${settings.alwaysOnTop ? " is-active" : ""}`}
            title={settings.alwaysOnTop ? t("widget.actions.cancelAlwaysOnTop") : t("widget.actions.alwaysOnTop")}
            onClick={() => void saveSettings({ alwaysOnTop: !settings.alwaysOnTop })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6.25h12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              <path
                d="M12 18V8.75M8.75 12l3.25-3.25L15.25 12"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>

          <button
            className={`icon-btn${isRefreshing ? " spinning" : ""}`}
            disabled={isRefreshing || isDragging}
            title={t("widget.actions.manualRefresh")}
            onClick={() => void manualRefresh()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              <path
                d="M20 5.5v5h-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>

          <button className="icon-btn icon-btn-relative" title={t("widget.actions.settings")} onClick={onOpenSettings}>
            {hasUpdate && <span className="update-badge" aria-hidden="true" />}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M19.4 15a1 1 0 0 0 .2 1.1l.05.06a2 2 0 1 1-2.83 2.83l-.06-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.92V20a2 2 0 1 1-4 0v-.08a1 1 0 0 0-.66-.94 1 1 0 0 0-1.1.2l-.06.05a2 2 0 1 1-2.83-2.83l.05-.06a1 1 0 0 0 .2-1.1 1 1 0 0 0-.92-.6H4a2 2 0 1 1 0-4h.08a1 1 0 0 0 .94-.66 1 1 0 0 0-.2-1.1l-.05-.06a2 2 0 1 1 2.83-2.83l.06.05a1 1 0 0 0 1.1.2h.02A1 1 0 0 0 9.7 4.1V4a2 2 0 1 1 4 0v.08a1 1 0 0 0 .66.94h.02a1 1 0 0 0 1.1-.2l.06-.05a2 2 0 1 1 2.83 2.83l-.05.06a1 1 0 0 0-.2 1.1v.02a1 1 0 0 0 .92.6H20a2 2 0 1 1 0 4h-.08a1 1 0 0 0-.94.66V15Z"
                fill="none"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        </div>
      </div>

      <OpacityHandle />
    </div>
  );
}
