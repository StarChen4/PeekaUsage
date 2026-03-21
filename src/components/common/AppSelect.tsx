import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n";

export type SelectValue = string | number;

export type SelectOption<T extends SelectValue = SelectValue> = {
  value: T;
  label: string;
  disabled?: boolean;
  providerId?: string;
};

type AppSelectProps<T extends SelectValue = SelectValue> = {
  modelValue: T | null;
  options: Array<SelectOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  listMaxHeight?: number;
  className?: string;
  onChange: (value: T) => void;
  onOpen?: () => void;
  onClose?: () => void;
  renderSelected?: (option: SelectOption<T> | null) => ReactNode;
  renderOption?: (args: {
    option: SelectOption<T>;
    selected: boolean;
    active: boolean;
  }) => ReactNode;
};

export default function AppSelect<T extends SelectValue = SelectValue>({
  modelValue,
  options,
  placeholder,
  disabled = false,
  ariaLabel,
  listMaxHeight = 240,
  className,
  onChange,
  onOpen,
  onClose,
  renderSelected,
  renderOption,
}: AppSelectProps<T>) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((option) => option.value === modelValue) ?? null;
  const resolvedPlaceholder = placeholder ?? t("common.select");
  const resolvedAriaLabel = ariaLabel ?? t("common.selectOption");

  function closeMenu() {
    if (!isOpen) {
      return;
    }

    setIsOpen(false);
    onClose?.();
  }

  function getFirstEnabledIndex() {
    return options.findIndex((option) => !option.disabled);
  }

  function setActiveToSelected() {
    const selectedIndex = options.findIndex((option) => option.value === modelValue && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex());
  }

  function syncPanelPosition() {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelHeight = Math.min(panel.scrollHeight, listMaxHeight);
    const gap = 6;
    const edgePadding = 12;
    const spaceBelow = viewportHeight - rect.bottom - edgePadding;
    const placeAbove = spaceBelow < Math.min(panelHeight, 180) && rect.top > spaceBelow;
    const top = placeAbove
      ? Math.max(edgePadding, rect.top - panelHeight - gap)
      : Math.max(edgePadding, Math.min(viewportHeight - edgePadding - panelHeight, rect.bottom + gap));
    const maxLeft = Math.max(edgePadding, viewportWidth - rect.width - edgePadding);
    const left = Math.min(Math.max(edgePadding, rect.left), maxLeft);

    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${rect.width}px`,
      maxHeight: `${listMaxHeight}px`,
    });
  }

  function scrollActiveOptionIntoView() {
    const panel = panelRef.current;
    if (!panel || activeIndex < 0) {
      return;
    }

    const activeOption = panel.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: "nearest" });
  }

  function openMenu() {
    if (disabled || options.length === 0 || isOpen) {
      return;
    }

    setActiveToSelected();
    setIsOpen(true);
    onOpen?.();
  }

  function toggleMenu() {
    if (isOpen) {
      closeMenu();
      return;
    }

    openMenu();
  }

  function focusTrigger() {
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  function selectOption(option: SelectOption<T>) {
    if (option.disabled) {
      return;
    }

    onChange(option.value);
    closeMenu();
    focusTrigger();
  }

  function moveActive(step: 1 | -1) {
    if (options.length === 0) {
      return;
    }

    let nextIndex = activeIndex;

    for (let index = 0; index < options.length; index += 1) {
      nextIndex = (nextIndex + step + options.length) % options.length;
      if (!options[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        window.requestAnimationFrame(scrollActiveOptionIntoView);
        return;
      }
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(getFirstEnabledIndex());
      window.requestAnimationFrame(scrollActiveOptionIntoView);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const reversedIndex = [...options].reverse().findIndex((option) => !option.disabled);
      if (reversedIndex >= 0) {
        setActiveIndex(options.length - reversedIndex - 1);
        window.requestAnimationFrame(scrollActiveOptionIntoView);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      focusTrigger();
      return;
    }

    if (event.key === "Tab") {
      closeMenu();
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    }

    function handleWindowChange() {
      syncPanelPosition();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    window.requestAnimationFrame(() => {
      syncPanelPosition();
      scrollActiveOptionIntoView();
    });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [isOpen, activeIndex, options, listMaxHeight, modelValue]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveToSelected();
    window.requestAnimationFrame(scrollActiveOptionIntoView);
  }, [isOpen, modelValue]);

  return (
    <div className={`app-select${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        className={`select-trigger${isOpen ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={resolvedAriaLabel}
        type="button"
        onClick={toggleMenu}
        onKeyDown={handleKeyDown}
      >
        <span className="select-trigger-content">
          {renderSelected ? renderSelected(selectedOption) : (
            <span className={`select-trigger-label${selectedOption ? "" : " is-placeholder"}`}>
              {selectedOption?.label ?? resolvedPlaceholder}
            </span>
          )}
        </span>
        <svg
          className={`select-caret${isOpen ? " is-open" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" />
        </svg>
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="select-panel"
          style={panelStyle}
          role="listbox"
          aria-label={resolvedAriaLabel}
        >
          {options.map((option, index) => {
            const selected = option.value === modelValue;
            const active = index === activeIndex;

            return (
              <button
                key={String(option.value)}
                className={[
                  "select-option",
                  selected ? "is-selected" : "",
                  active ? "is-active" : "",
                  option.disabled ? "is-disabled" : "",
                ].filter(Boolean).join(" ")}
                aria-selected={selected}
                data-index={index}
                disabled={option.disabled}
                role="option"
                tabIndex={-1}
                type="button"
                onClick={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {renderOption ? renderOption({ option, selected, active }) : (
                  <span className="select-option-label">{option.label}</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
