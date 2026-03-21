import { useI18n } from "../../i18n";
import { useWindowControls } from "../../composables/useWindowControls";

export default function TitleBar() {
  const { minimizeWindow, closeToTray } = useWindowControls();
  const { t } = useI18n();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-dot" />
        <span className="titlebar-title" data-tauri-drag-region>
          PeekaUsage
        </span>
      </div>
      <div className="titlebar-actions">
        <button className="titlebar-btn" onClick={() => void minimizeWindow()} title={t("titleBar.minimize")}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4" width="10" height="1.5" fill="currentColor" rx="0.5" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => void closeToTray()}
          title={t("titleBar.hideToTray")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
