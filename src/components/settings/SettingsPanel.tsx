import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import type { ProviderConfigItem, ProviderId } from "../../types/provider";
import {
  MAX_POLLING_INTERVAL,
  MIN_POLLING_INTERVAL,
  getEffectivePollingSettings,
  normalizePollingInterval,
  type AppLanguage,
  type PollingMode,
  type PollingSettings,
  type PollingUnit,
} from "../../types/settings";
import { useWindowControls } from "../../composables/useWindowControls";
import { LANGUAGE_OPTIONS } from "../../i18n/messages";
import { useProviderStore } from "../../stores/providerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { syncLaunchAtStartup } from "../../utils/autostart";
import { getProviderConfigs, getSupportedProviders, setWindowSkipTaskbar } from "../../utils/ipc";
import AppSelect, { type SelectOption } from "../common/AppSelect";
import ProviderIcon from "../common/ProviderIcon";
import ProviderConfig from "./ProviderConfig";
import UpdateSettings from "./UpdateSettings";
import { useUpdateStore } from "../../stores/updateStore";

type SettingsPanelProps = {
  onBack: () => void;
};

type SettingsSectionId = "general" | "providers" | "advanced" | "updates";

type SettingsMenuItem =
  {
    id: SettingsSectionId;
    label: string;
  };

function BackIcon() {
  return (
    <svg
      className="back-icon"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9.5 3.5L5 8l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const settings = useSettingsStore((state) => state.settings);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const { updateOpacity } = useWindowControls();
  const { t } = useI18n();
  const hasUpdate = useUpdateStore((state) => state.hasUpdate);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigItem[]>([]);
  const [supportedProviders, setSupportedProviders] = useState<ProviderConfigItem[]>([]);
  const [creatingProviderId, setCreatingProviderId] = useState<ProviderId | null>(null);
  const [opacityDraft, setOpacityDraft] = useState(settings.windowOpacity);
  const [launchAtStartupPending, setLaunchAtStartupPending] = useState(false);
  const [hideTaskbarPending, setHideTaskbarPending] = useState(false);
  const [generalNotice, setGeneralNotice] = useState<string | null>(null);
  const [pollingIntervalDraft, setPollingIntervalDraft] = useState(String(settings.pollingInterval));
  const [providerPollingIntervalDrafts, setProviderPollingIntervalDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const isWindows = useMemo(
    () => typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent),
    [],
  );

  const languageOptions: Array<SelectOption<AppLanguage>> = LANGUAGE_OPTIONS.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  const pollingModeOptions: Array<SelectOption<PollingMode>> = [
    { value: "auto", label: t("settings.polling.auto") },
    { value: "manual", label: t("settings.polling.manual") },
  ];

  const pollingUnitOptions: Array<SelectOption<PollingUnit>> = [
    { value: "seconds", label: t("common.secondsShort") },
    { value: "minutes", label: t("common.minutesShort") },
  ];

  const sectionItems: SettingsMenuItem[] = useMemo(() => ([
    { id: "general", label: t("settings.sections.general") },
    { id: "providers", label: t("settings.sections.providers") },
    { id: "advanced", label: t("settings.sections.advanced") },
    { id: "updates", label: t("settings.sections.updates") },
  ]), [t]);

  const activeSectionLabel = sectionItems.find((item) => item.id === activeSection)?.label
    ?? t("settings.sections.general");

  const configuredProviderIds = new Set(providerConfigs.map((item) => item.providerId));
  const availableProviders = supportedProviders.filter((item) => !configuredProviderIds.has(item.providerId));
  const isManualPolling = settings.pollingMode === "manual";
  const configuredPollingProviders = providerConfigs.filter((item) => item.enabled);
  const selectedDraftProvider = creatingProviderId
    ? availableProviders.find((item) => item.providerId === creatingProviderId) ?? null
    : null;
  const draftProviderConfig = selectedDraftProvider
    ? {
        ...selectedDraftProvider,
        enabled: true,
        apiKeys: [
          {
            id: `${selectedDraftProvider.providerId}-draft-key`,
            name: t("settings.providerConfig.keyName", { index: 1 }),
            color: "#3b82f6",
            value: "",
            isActiveInEnvironment: false,
          },
        ],
        subscriptions: selectedDraftProvider.capabilities.hasSubscription
          ? [
              {
                id: `${selectedDraftProvider.providerId}-draft-subscription`,
                name: t("settings.providerConfig.subscriptionName", { index: 1 }),
                color: "#3b82f6",
                oauthToken: "",
                source: null,
              },
            ]
          : [],
        environmentVariableName: selectedDraftProvider.environmentVariableName,
        activeApiKeyId: null,
      }
    : null;

  async function loadProviderData() {
    try {
      const [configs, supported] = await Promise.all([
        getProviderConfigs(),
        getSupportedProviders(),
      ]);

      setProviderConfigs(configs);
      setSupportedProviders(supported);

      setCreatingProviderId((current) => {
        if (!current) {
          return current;
        }

        const nextAvailable = supported.filter((item) => !new Set(configs.map((config) => config.providerId)).has(item.providerId));
        return nextAvailable.some((item) => item.providerId === current)
          ? current
          : nextAvailable[0]?.providerId ?? null;
      });
    } catch {
      setProviderConfigs([]);
      setSupportedProviders([]);
    }
  }

  function getProviderPollingSettings(providerId: ProviderId): PollingSettings {
    return getEffectivePollingSettings(settings, providerId);
  }

  function syncProviderPollingDrafts() {
    const nextDrafts: Partial<Record<ProviderId, string>> = {};

    for (const item of configuredPollingProviders) {
      nextDrafts[item.providerId] = String(getProviderPollingSettings(item.providerId).pollingInterval);
    }

    setProviderPollingIntervalDrafts(nextDrafts);
  }

  async function saveProviderPollingSettings(
    providerId: ProviderId,
    nextSettings: Partial<PollingSettings>,
  ) {
    const current = getProviderPollingSettings(providerId);
    await saveSettings({
      providerPollingOverrides: {
        ...settings.providerPollingOverrides,
        [providerId]: {
          ...current,
          ...nextSettings,
        },
      },
    });
  }

  async function reloadProviders() {
    await loadProviderData();
    await useProviderStore.getState().refreshAll();
  }

  function showHideTaskbarNotice() {
    setGeneralNotice(t("settings.hideTaskbarIcon.notice"));
  }

  async function handleHideTaskbarIconChange(enabled: boolean) {
    if (!isWindows || hideTaskbarPending || enabled === settings.hideTaskbarIcon) {
      return;
    }

    setHideTaskbarPending(true);

    try {
      await setWindowSkipTaskbar(enabled);
      const shouldShowNotice = enabled && !settings.hideTaskbarIconHintShown;
      await saveSettings({
        hideTaskbarIcon: enabled,
        hideTaskbarIconHintShown: settings.hideTaskbarIconHintShown || shouldShowNotice,
      });

      if (shouldShowNotice) {
        showHideTaskbarNotice();
      }
    } catch (error) {
      try {
        await setWindowSkipTaskbar(settings.hideTaskbarIcon);
      } catch (rollbackError) {
        console.error("回滚任务栏图标状态失败：", rollbackError);
      }

      console.error("切换任务栏图标状态失败：", error);
    } finally {
      setHideTaskbarPending(false);
    }
  }

  async function handleLaunchAtStartupChange(enabled: boolean) {
    if (launchAtStartupPending || enabled === settings.launchAtStartup) {
      return;
    }

    setLaunchAtStartupPending(true);

    try {
      await syncLaunchAtStartup(enabled);
      const shouldLinkHideTaskbar = isWindows && enabled && !settings.hideTaskbarIcon;

      if (shouldLinkHideTaskbar) {
        await setWindowSkipTaskbar(true);
      }

      const shouldShowNotice = shouldLinkHideTaskbar && !settings.hideTaskbarIconHintShown;
      await saveSettings({
        launchAtStartup: enabled,
        ...(shouldLinkHideTaskbar
          ? {
              hideTaskbarIcon: true,
              hideTaskbarIconHintShown: settings.hideTaskbarIconHintShown || shouldShowNotice,
            }
          : {}),
      });

      if (shouldShowNotice) {
        showHideTaskbarNotice();
      }
    } catch (error) {
      try {
        await syncLaunchAtStartup(settings.launchAtStartup);
      } catch (rollbackError) {
        console.error("回滚开机自动启动状态失败：", rollbackError);
      }

      console.error("同步开机自动启动失败：", error);
    } finally {
      setLaunchAtStartupPending(false);
    }
  }

  function handleSectionSelect(sectionId: SettingsSectionId) {
    setActiveSection(sectionId);
  }

  useEffect(() => {
    void loadProviderData();
  }, []);

  useEffect(() => {
    setOpacityDraft(settings.windowOpacity);
  }, [settings.windowOpacity]);

  useEffect(() => {
    setPollingIntervalDraft(String(settings.pollingInterval));
  }, [settings.pollingInterval]);

  useEffect(() => {
    syncProviderPollingDrafts();
  }, [
    providerConfigs,
    settings.providerPollingOverrides,
    settings.providerPollingOverridesEnabled,
    settings.pollingInterval,
    settings.pollingMode,
    settings.pollingUnit,
  ]);

  useEffect(() => {
    if (!generalNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setGeneralNotice(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [generalNotice]);

  const sectionContent: Record<SettingsSectionId, ReactNode> = {
    general: (
      <section className="settings-section settings-section-page">
        <h3 className="section-title">{t("settings.sections.general")}</h3>
        {generalNotice && (
          <div className="save-result is-success" role="status">
            {generalNotice}
          </div>
        )}
        <div className="setting-row">
          <label>{t("settings.language.label")}</label>
          <div className="setting-select-wrap">
            <AppSelect
              modelValue={settings.language}
              options={languageOptions}
              ariaLabel={t("settings.language.ariaLabel")}
              onChange={(value) => void saveSettings({ language: value })}
            />
          </div>
        </div>

        <div className="setting-row setting-row-polling">
          <label>{t("settings.polling.label")}</label>
          <div className="polling-control">
            <div className="polling-segment" role="group" aria-label={t("settings.polling.modeAriaLabel")}>
              {pollingModeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`polling-segment-button${settings.pollingMode === option.value ? " is-active" : ""}`}
                  type="button"
                  aria-pressed={settings.pollingMode === option.value}
                  onClick={() => void saveSettings({ pollingMode: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {!isManualPolling && (
              <div className="polling-auto-inline">
                <input
                  className="polling-interval-input"
                  type="number"
                  inputMode="numeric"
                  min={MIN_POLLING_INTERVAL}
                  max={MAX_POLLING_INTERVAL}
                  value={pollingIntervalDraft}
                  aria-label={t("settings.polling.intervalAriaLabel")}
                  onChange={(event) => setPollingIntervalDraft(event.target.value)}
                  onBlur={() => {
                    const parsed = Number.parseInt(pollingIntervalDraft, 10);
                    const nextValue = normalizePollingInterval(
                      Number.isNaN(parsed) ? settings.pollingInterval : parsed,
                    );
                    setPollingIntervalDraft(String(nextValue));

                    if (nextValue !== settings.pollingInterval) {
                      void saveSettings({ pollingInterval: nextValue });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <div className="polling-segment polling-unit-segment" role="group" aria-label={t("settings.polling.unitAriaLabel")}>
                  {pollingUnitOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`polling-segment-button${settings.pollingUnit === option.value ? " is-active" : ""}`}
                      type="button"
                      aria-pressed={settings.pollingUnit === option.value}
                      onClick={() => void saveSettings({ pollingUnit: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="setting-row setting-row-slider">
          <label htmlFor="window-opacity-range">{t("settings.opacity.label")}</label>
          <div className="opacity-control">
            <input
              id="window-opacity-range"
              className="opacity-range"
              type="range"
              min="10"
              max="100"
              step="1"
              value={opacityDraft}
              onInput={(event) => {
                const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
                setOpacityDraft(value);
                void updateOpacity(value, false);
              }}
              onChange={(event) => {
                const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
                setOpacityDraft(value);
                void updateOpacity(value, true);
              }}
            />
            <span className="opacity-value">{opacityDraft}%</span>
          </div>
        </div>

        <label className="setting-row setting-row-toggle">
          <span className="setting-copy">
            <span className="setting-label">{t("settings.launchAtStartup.label")}</span>
            <span className="setting-hint">{t("settings.launchAtStartup.hint")}</span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={settings.launchAtStartup}
              disabled={launchAtStartupPending}
              onChange={(event) => void handleLaunchAtStartupChange(event.target.checked)}
            />
            <span className="switch-track" />
          </span>
        </label>

        <label className="setting-row setting-row-toggle">
          <span className="setting-copy">
            <span className="setting-label">{t("settings.hideTaskbarIcon.label")}</span>
            <span className="setting-hint">
              {isWindows
                ? t("settings.hideTaskbarIcon.hint")
                : t("settings.hideTaskbarIcon.unsupportedHint")}
            </span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={isWindows ? settings.hideTaskbarIcon : false}
              disabled={!isWindows || hideTaskbarPending || launchAtStartupPending}
              onChange={(event) => void handleHideTaskbarIconChange(event.target.checked)}
            />
            <span className="switch-track" />
          </span>
        </label>

        <label className="setting-row setting-row-toggle">
          <span className="setting-copy">
            <span className="setting-label">{t("settings.refreshOnBack.label")}</span>
            <span className="setting-hint">{t("settings.refreshOnBack.hint")}</span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={settings.refreshOnSettingsClose}
              onChange={(event) => void saveSettings({ refreshOnSettingsClose: event.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>

        <label className="setting-row setting-row-toggle">
          <span className="setting-copy">
            <span className="setting-label">{t("settings.autoExpandWindow.label")}</span>
            <span className="setting-hint">{t("settings.autoExpandWindow.hint")}</span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={settings.autoExpandWindowToFitContent}
              onChange={(event) => void saveSettings({ autoExpandWindowToFitContent: event.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>

        <label className="setting-row setting-row-toggle">
          <span className="setting-copy">
            <span className="setting-label">{t("settings.edgeDockCollapse.label")}</span>
            <span className="setting-hint">{t("settings.edgeDockCollapse.hint")}</span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={settings.edgeDockCollapseEnabled}
              onChange={(event) => void saveSettings({ edgeDockCollapseEnabled: event.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>

        <label className="setting-row setting-row-toggle">
          <span className="setting-copy">
            <span className="setting-label">{t("settings.compactColorMarkers.label")}</span>
            <span className="setting-hint">{t("settings.compactColorMarkers.hint")}</span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={settings.compactColorMarkersEnabled}
              onChange={(event) => void saveSettings({ compactColorMarkersEnabled: event.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>
      </section>
    ),
    providers: (
      <section className="settings-section settings-section-page">
        <div className="section-header">
          <h3 className="section-title">{t("settings.sections.providers")}</h3>
          {!creatingProviderId && availableProviders.length > 0 && (
            <button
              className="add-provider-btn"
              type="button"
              onClick={() => setCreatingProviderId(availableProviders[0]?.providerId ?? null)}
            >
              +
            </button>
          )}
        </div>

        {draftProviderConfig && (
          <ProviderConfig
            config={draftProviderConfig}
            expanded
            mode="create"
            selectableProviders={availableProviders}
            onProviderChange={(providerId) => setCreatingProviderId(providerId)}
            onCanceled={() => setCreatingProviderId(null)}
            onSaved={() => void (async () => {
              setCreatingProviderId(null);
              await reloadProviders();
            })()}
          />
        )}

        {providerConfigs.length === 0 && !draftProviderConfig && (
          <div className="provider-empty-state">
            <span>{t("settings.providersSection.empty")}</span>
          </div>
        )}

        {providerConfigs.map((config) => (
          <ProviderConfig
            key={config.providerId}
            config={config}
            expanded={settings.providerCardExpanded[config.providerId] ?? true}
            onExpandedChange={(expanded) => void saveSettings({
              providerCardExpanded: {
                ...settings.providerCardExpanded,
                [config.providerId]: expanded,
              },
            })}
            onSaved={() => void (async () => {
              setCreatingProviderId(null);
              await reloadProviders();
            })()}
            onRemoved={() => void reloadProviders()}
            onEnvironmentChanged={() => loadProviderData()}
          />
        ))}
      </section>
    ),
    advanced: (
      <section className="settings-section settings-section-page">
        <div className="section-header">
          <h3 className="section-title">{t("settings.sections.advanced")}</h3>
        </div>

        <label className="advanced-toggle">
          <span className="advanced-toggle-copy">
            <span className="advanced-toggle-title">{t("settings.advancedSection.title")}</span>
            <span className="advanced-toggle-hint">{t("settings.advancedSection.hint")}</span>
          </span>
          <span className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={settings.providerPollingOverridesEnabled}
              onChange={(event) => void saveSettings({ providerPollingOverridesEnabled: event.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>

        {settings.providerPollingOverridesEnabled && configuredPollingProviders.length === 0 && (
          <div className="provider-empty-state">
            <span>{t("settings.advancedSection.empty")}</span>
          </div>
        )}

        {settings.providerPollingOverridesEnabled && configuredPollingProviders.length > 0 && (
          <div className="provider-polling-list">
            {configuredPollingProviders.map((config) => {
              const providerPollingSettings = getProviderPollingSettings(config.providerId);

              return (
                <div key={config.providerId} className="provider-polling-item">
                  <div className="provider-polling-meta">
                    <ProviderIcon providerId={config.providerId} size={16} />
                    <span className="provider-polling-name">{config.displayName}</span>
                  </div>

                  <div className="polling-control polling-control-compact">
                    <div
                      className="polling-segment polling-segment-compact"
                      role="group"
                      aria-label={`${config.displayName} ${t("settings.polling.modeAriaLabel")}`}
                    >
                      {pollingModeOptions.map((option) => (
                        <button
                          key={option.value}
                          className={`polling-segment-button polling-segment-button-compact${providerPollingSettings.pollingMode === option.value ? " is-active" : ""}`}
                          type="button"
                          aria-pressed={providerPollingSettings.pollingMode === option.value}
                          onClick={() => void saveProviderPollingSettings(config.providerId, { pollingMode: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {providerPollingSettings.pollingMode !== "manual" && (
                      <div className="polling-auto-inline polling-auto-inline-compact">
                        <input
                          className="polling-interval-input polling-interval-input-compact"
                          type="number"
                          inputMode="numeric"
                          min={MIN_POLLING_INTERVAL}
                          max={MAX_POLLING_INTERVAL}
                          value={providerPollingIntervalDrafts[config.providerId] ?? String(providerPollingSettings.pollingInterval)}
                          aria-label={`${config.displayName} ${t("settings.polling.intervalAriaLabel")}`}
                          onChange={(event) => setProviderPollingIntervalDrafts((current) => ({
                            ...current,
                            [config.providerId]: event.target.value,
                          }))}
                          onBlur={() => {
                            const rawValue = providerPollingIntervalDrafts[config.providerId] ?? "";
                            const parsed = Number.parseInt(rawValue, 10);
                            const nextValue = normalizePollingInterval(
                              Number.isNaN(parsed) ? providerPollingSettings.pollingInterval : parsed,
                            );

                            setProviderPollingIntervalDrafts((current) => ({
                              ...current,
                              [config.providerId]: String(nextValue),
                            }));

                            if (nextValue !== providerPollingSettings.pollingInterval) {
                              void saveProviderPollingSettings(config.providerId, { pollingInterval: nextValue });
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              (event.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                        <div
                          className="polling-segment polling-unit-segment polling-segment-compact"
                          role="group"
                          aria-label={`${config.displayName} ${t("settings.polling.unitAriaLabel")}`}
                        >
                          {pollingUnitOptions.map((option) => (
                            <button
                              key={option.value}
                              className={`polling-segment-button polling-segment-button-compact${providerPollingSettings.pollingUnit === option.value ? " is-active" : ""}`}
                              type="button"
                              aria-pressed={providerPollingSettings.pollingUnit === option.value}
                              onClick={() => void saveProviderPollingSettings(config.providerId, { pollingUnit: option.value })}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    ),
    updates: <UpdateSettings />,
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <button
          className="back-btn"
          type="button"
          aria-label={t("common.back")}
          onClick={onBack}
        >
          <BackIcon />
        </button>

        <div className="settings-title-group">
          <span className="settings-title">{t("settings.title")}</span>
          <span className="settings-subtitle">{activeSectionLabel}</span>
        </div>
      </div>

      <div className="settings-subnav" role="tablist" aria-label={t("settings.navigationAriaLabel")}>
        {sectionItems.map((item) => {
          const isActive = item.id === activeSection;

          return (
            <button
              key={item.id}
              className={`settings-subnav-item${isActive ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSectionSelect(item.id)}
            >
              <span className="settings-subnav-label">{item.label}</span>
              {item.id === "updates" && hasUpdate && (
                <span className="settings-subnav-badge" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <div className="settings-body">
        {sectionContent[activeSection]}
      </div>
    </div>
  );
}
