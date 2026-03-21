import { useI18n } from "../../i18n";
import { useWindowControls } from "../../composables/useWindowControls";

export default function OpacityHandle() {
  const { isDraggingOpacity, opacity, startOpacityDrag } = useWindowControls();
  const { t } = useI18n();

  return (
    <div
      className={`opacity-handle${isDraggingOpacity ? " dragging" : ""}`}
      onMouseDown={(event) => {
        event.preventDefault();
        startOpacityDrag(event.clientY);
      }}
      title={t("widget.opacityHandle.title", { opacity })}
    >
      <div className="handle-track">
        <div className="handle-fill" style={{ height: `${opacity}%` }} />
      </div>
    </div>
  );
}
