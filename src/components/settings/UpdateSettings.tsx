import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUpdateStore } from "../../stores/updateStore";

export default function UpdateSettings() {
  const { t } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const saveSettings = useSettingsStore((state) => state.saveSettings);

  const { status, isChecking, isInstalling, lastCheckAt, checkUpdate, installUpdate } =
    useUpdateStore();

  const [intervalDraft, setIntervalDraft] = useState<string>(
    String(settings.updateCheckIntervalHours),
  );

  useEffect(() => {
    setIntervalDraft(String(settings.updateCheckIntervalHours));
  }, [settings.updateCheckIntervalHours]);

  function formatLastCheckAt(ts: number | null): string {
    if (!ts) return t("settings.updates.never");
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function handleViewChangelog() {
    const version = status?.currentVersion ?? "";
    const url = `https://github.com/StarChen4/PeekaUsage/releases/tag/v${version}`;
    try {
      await openUrl(url);
    } catch (e) {
      console.error("open url failed", e);
    }
  }

  async function handleViewReleaseUrl() {
    if (!status?.releaseUrl) return;
    try {
      await openUrl(status.releaseUrl);
    } catch (e) {
      console.error("open url failed", e);
    }
  }

  function getUpdateButtonLabel(): string {
    if (isInstalling) return t("settings.updates.installing");
    if (status?.state === "available" && status.availableVersion) {
      return `${t("settings.updates.updateTo")} v${status.availableVersion}`;
    }
    return t("settings.updates.upToDate");
  }

  function getCheckStatusLabel(): string {
    if (isChecking) return t("settings.updates.checking");
    if (!status || status.state === "idle") return "";
    if (status.state === "up-to-date") return t("settings.updates.upToDate");
    if (status.state === "available") {
      return `${t("settings.updates.available")}: v${status.availableVersion}`;
    }
    if (status.state === "error") {
      return `${t("settings.updates.error")}: ${status.errorMessage ?? ""}`;
    }
    return "";
  }

  const hasUpdate = status?.state === "available";

  return (
    <section className="settings-section settings-section-page">
      <div className="section-header">
        <h3 className="section-title">{t("settings.updates.title")}</h3>
      </div>

      {/* 版本信息区 */}
      <div className="update-version-row">
        <span className="update-version-label">{t("settings.updates.currentVersion")}</span>
        <span className="update-version-value">{status?.currentVersion ?? "—"}</span>
        <button
          className="update-changelog-btn"
          type="button"
          onClick={() => void handleViewChangelog()}
        >
          {t("settings.updates.viewChangelog")}
        </button>
      </div>

      {/* 检查更新区 */}
      <div className="update-check-row">
        <button
          className="update-check-btn"
          type="button"
          disabled={isChecking}
          onClick={() => void checkUpdate()}
        >
          {isChecking ? t("settings.updates.checking") : t("settings.updates.checkUpdate")}
        </button>
        <div className="update-check-meta">
          {lastCheckAt != null && (
            <span className="update-last-check">
              {t("settings.updates.lastCheckAt")}: {formatLastCheckAt(lastCheckAt)}
            </span>
          )}
          {!isChecking && getCheckStatusLabel() && (
            <span
              className={`update-status-label${hasUpdate ? " is-available" : ""}${status?.state === "error" ? " is-error" : ""}`}
            >
              {getCheckStatusLabel()}
            </span>
          )}
        </div>
      </div>

      {/* 有更新时展示说明 */}
      {hasUpdate && status?.notes && (
        <div className="update-notes">
          <div className="update-notes-title">{t("settings.updates.releaseNotes")}</div>
          <div className="update-notes-body">{status.notes}</div>
          {status.releaseUrl && (
            <button
              className="update-changelog-btn"
              type="button"
              onClick={() => void handleViewReleaseUrl()}
            >
              {t("settings.updates.viewChangelog")}
            </button>
          )}
        </div>
      )}

      {/* 安装更新区 */}
      <div className="update-install-row">
        <button
          className={`update-install-btn${hasUpdate ? " is-available" : ""}`}
          type="button"
          disabled={!hasUpdate || isInstalling}
          onClick={() => void installUpdate()}
        >
          {getUpdateButtonLabel()}
        </button>
      </div>

      {/* 自动检查设置 */}
      <label className="settings-toggle-row">
        <span className="settings-toggle-copy">
          <span className="settings-toggle-title">{t("settings.updates.autoCheck")}</span>
        </span>
        <span className="switch">
          <input
            className="switch-input"
            type="checkbox"
            checked={settings.updateAutoCheckEnabled}
            onChange={(e) => void saveSettings({ updateAutoCheckEnabled: e.target.checked })}
          />
          <span className="switch-track" />
        </span>
      </label>

      {settings.updateAutoCheckEnabled && (
        <>
          <label className="settings-toggle-row">
            <span className="settings-toggle-copy">
              <span className="settings-toggle-title">{t("settings.updates.checkOnLaunch")}</span>
            </span>
            <span className="switch">
              <input
                className="switch-input"
                type="checkbox"
                checked={settings.updateCheckOnLaunch}
                onChange={(e) => void saveSettings({ updateCheckOnLaunch: e.target.checked })}
              />
              <span className="switch-track" />
            </span>
          </label>

          <div className="update-interval-row">
            <span className="update-interval-label">{t("settings.updates.checkInterval")}</span>
            <input
              className="polling-interval-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={168}
              value={intervalDraft}
              onChange={(e) => setIntervalDraft(e.target.value)}
              onBlur={() => {
                const parsed = Number.parseInt(intervalDraft, 10);
                const val = Number.isNaN(parsed) ? 2 : Math.max(1, Math.min(168, parsed));
                setIntervalDraft(String(val));
                if (val !== settings.updateCheckIntervalHours) {
                  void saveSettings({ updateCheckIntervalHours: val });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="update-interval-unit">{t("settings.updates.checkIntervalUnit")}</span>
          </div>
          <span className="settings-hint">{t("settings.updates.checkIntervalHint")}</span>
        </>
      )}
    </section>
  );
}
