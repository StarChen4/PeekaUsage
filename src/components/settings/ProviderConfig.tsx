import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../i18n";
import type {
  ProviderApiKeyItem,
  ProviderConfigItem,
  ProviderId,
} from "../../types/provider";
import {
  detectOAuthTokens,
  removeProviderConfig,
  saveProviderConfig,
  validateApiKey,
} from "../../utils/ipc";
import AppSelect, { type SelectOption } from "../common/AppSelect";
import ConfirmDialog from "../common/ConfirmDialog";
import ProviderIcon from "../common/ProviderIcon";
import ApiKeyInput from "./ApiKeyInput";

const OAUTH_METHOD_URLS: Partial<Record<ProviderId, string>> = {
  anthropic: "https://code.claude.com/docs/en/authentication",
  openai: "https://developers.openai.com/codex/auth",
};

type ProviderConfigProps = {
  config: ProviderConfigItem;
  expanded: boolean;
  mode?: "edit" | "create";
  selectableProviders?: ProviderConfigItem[];
  onSaved?: () => void;
  onCanceled?: () => void;
  onRemoved?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onProviderChange?: (providerId: ProviderId) => void;
};

export default function ProviderConfig({
  config,
  expanded,
  mode = "edit",
  selectableProviders = [],
  onSaved,
  onCanceled,
  onRemoved,
  onExpandedChange,
  onProviderChange,
}: ProviderConfigProps) {
  const { t } = useI18n();
  const [apiKeys, setApiKeys] = useState<ProviderApiKeyItem[]>([]);
  const [oauthToken, setOauthToken] = useState("");
  const [validatingKeyId, setValidatingKeyId] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, boolean | null>>({});
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const syncingFromPropsRef = useRef(false);
  const keepSaveResultOnNextSyncRef = useRef(false);

  const isCreateMode = mode === "create";
  const selectedProvider = isCreateMode
    ? selectableProviders.find((item) => item.providerId === config.providerId) ?? config
    : config;

  const selectableProviderOptions: Array<SelectOption<ProviderId>> = selectableProviders.map((item) => ({
    value: item.providerId,
    label: item.displayName,
    providerId: item.providerId,
  }));

  const canDetectOAuth = selectedProvider.capabilities.hasSubscription;

  function defaultKeyName(index: number) {
    return t("settings.providerConfig.keyName", { index: index + 1 });
  }

  function createKeyId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }

    return `key-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function createEmptyApiKey(index: number): ProviderApiKeyItem {
    return {
      id: createKeyId(),
      name: defaultKeyName(index),
      value: "",
    };
  }

  function cloneApiKeys(source: ProviderApiKeyItem[]) {
    if (source.length === 0) {
      return [createEmptyApiKey(0)];
    }

    return source.map((item, index) => ({
      id: item.id || createKeyId(),
      name: item.name || defaultKeyName(index),
      value: item.value,
    }));
  }

  function sanitizedApiKeys(items: ProviderApiKeyItem[]) {
    return items
      .map((item, index) => ({
        id: item.id,
        name: item.name.trim() || defaultKeyName(index),
        value: item.value.trim(),
      }))
      .filter((item) => item.value.length > 0);
  }

  function clearTransientState() {
    setValidatingKeyId(null);
    setValidationResults({});
    setDetecting(false);
    setDetectResult(null);
    setShowRemoveDialog(false);
  }

  const hasAnyCredential = sanitizedApiKeys(apiKeys).length > 0 || oauthToken.trim().length > 0;
  const hasChanges = JSON.stringify({
    apiKeys: sanitizedApiKeys(apiKeys),
    oauthToken: oauthToken.trim(),
  }) !== JSON.stringify({
    apiKeys: sanitizedApiKeys(config.apiKeys),
    oauthToken: config.oauthToken.trim(),
  });

  const saveButtonLabel = saving
    ? isCreateMode ? t("settings.providerConfig.adding") : t("common.saving")
    : !isCreateMode && saveResult?.type === "success" && !hasChanges
      ? t("common.saved")
      : isCreateMode ? t("settings.providerConfig.addConfirm") : t("common.save");

  useEffect(() => {
    syncingFromPropsRef.current = true;
    setApiKeys(cloneApiKeys(config.apiKeys));
    setOauthToken(config.oauthToken);
    syncingFromPropsRef.current = false;
    clearTransientState();

    if (keepSaveResultOnNextSyncRef.current) {
      keepSaveResultOnNextSyncRef.current = false;
      return;
    }

    setSaveResult(null);
  }, [config]);

  useEffect(() => {
    if (syncingFromPropsRef.current) {
      return;
    }

    clearTransientState();
    setSaveResult(null);
  }, [apiKeys, oauthToken]);

  async function handleValidate(index: number) {
    const target = apiKeys[index];
    const value = target?.value.trim();
    if (!target || !value || value.includes("...")) {
      return;
    }

    setValidatingKeyId(target.id);
    setValidationResults((current) => ({
      ...current,
      [target.id]: null,
    }));

    try {
      const result = await validateApiKey(config.providerId, value);
      setValidationResults((current) => ({
        ...current,
        [target.id]: result,
      }));
    } catch {
      setValidationResults((current) => ({
        ...current,
        [target.id]: false,
      }));
    } finally {
      setValidatingKeyId(null);
    }
  }

  async function handleDetectToken() {
    if (!canDetectOAuth) {
      return;
    }

    setDetecting(true);
    setDetectResult(null);

    try {
      const tokens = await detectOAuthTokens();
      const found = config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;

      if (found) {
        setOauthToken(found.token);
        const subscriptionType = found.subscriptionType
          ? t("settings.providerConfig.detectedTokenType", { subscriptionType: found.subscriptionType })
          : "";
        setDetectResult(t("settings.providerConfig.detectedToken", {
          source: found.source,
          subscriptionType,
        }));
      } else {
        setDetectResult(t("settings.providerConfig.tokenNotFound"));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDetectResult(t("settings.providerConfig.detectFailed", { message }));
    } finally {
      setDetecting(false);
    }
  }

  async function handleOpenOauthMethod() {
    const url = OAUTH_METHOD_URLS[config.providerId];
    if (!url) {
      return;
    }

    try {
      await openUrl(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDetectResult(t("settings.providerConfig.openMethodFailed", { message }));
    }
  }

  async function handleSave() {
    if (saving || !hasAnyCredential) {
      return;
    }

    if (!isCreateMode && !hasChanges) {
      return;
    }

    setSaving(true);
    setSaveResult(null);

    try {
      await saveProviderConfig({
        providerId: config.providerId,
        apiKeys: sanitizedApiKeys(apiKeys),
        oauthToken: oauthToken.trim(),
        enabled: true,
      });

      if (isCreateMode) {
        onSaved?.();
        return;
      }

      keepSaveResultOnNextSyncRef.current = true;
      setSaveResult({
        type: "success",
        message: t("settings.providerConfig.saveSuccess"),
      });
      onSaved?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveResult({
        type: "error",
        message: t("settings.providerConfig.saveFailed", { message }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmRemove() {
    if (removing) {
      return;
    }

    setRemoving(true);
    setShowRemoveDialog(false);
    setSaveResult(null);

    try {
      await removeProviderConfig(config.providerId);
      onRemoved?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveResult({
        type: "error",
        message: t("settings.providerConfig.removeFailed", { message }),
      });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={`provider-config${isCreateMode ? " is-create" : ""}`}>
      <div className="config-header">
        {isCreateMode ? (
          <div className="provider-select-wrap">
            <label className="field-label">{t("settings.providerConfig.selectProvider")}</label>
            <AppSelect
              className="provider-select"
              modelValue={config.providerId}
              options={selectableProviderOptions}
              ariaLabel={t("settings.providerConfig.selectProvider")}
              placeholder={t("settings.providerConfig.selectProvider")}
              onChange={(providerId) => onProviderChange?.(providerId)}
              renderSelected={(option) => (
                <span className={`provider-select-value${option ? "" : " is-placeholder"}`}>
                  {option ? (
                    <>
                      <ProviderIcon providerId={option.value as ProviderId} size={18} />
                      <span className="provider-select-text">{option.label}</span>
                    </>
                  ) : (
                    <span className="provider-select-text">{t("settings.providerConfig.selectProvider")}</span>
                  )}
                </span>
              )}
              renderOption={({ option }) => (
                <span className="provider-select-value">
                  <ProviderIcon providerId={option.value as ProviderId} size={18} />
                  <span className="provider-select-text">{option.label}</span>
                </span>
              )}
            />
          </div>
        ) : (
          <>
            <div className="provider-title">
              <ProviderIcon providerId={config.providerId} size={20} />
              <span className="provider-name">{config.displayName}</span>
            </div>
            <button
              className="collapse-toggle"
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? t("settings.providerConfig.collapse") : t("settings.providerConfig.expand")}
              onClick={() => onExpandedChange?.(!expanded)}
            >
              <svg
                className={`collapse-icon${expanded ? " is-expanded" : ""}`}
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path d="M2.5 4.5L6 8L9.5 4.5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {(isCreateMode || expanded) && (
        <div className="config-body">
          <div className="field-group">
            <div className="field-row">
              <label className="field-label">{t("settings.providerConfig.apiKeyLabel")}</label>
              <button
                className="btn btn-sm btn-secondary"
                type="button"
                onClick={() => {
                  setApiKeys((current) => [...current, createEmptyApiKey(current.length)]);
                  setSaveResult(null);
                }}
              >
                {t("settings.providerConfig.addKey")}
              </button>
            </div>

            {apiKeys.map((item, index) => (
              <div key={item.id} className="api-key-card">
                <div className="api-key-header">
                  <input
                    value={item.name}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setApiKeys((current) => current.map((currentItem, currentIndex) => (
                        currentIndex === index
                          ? { ...currentItem, name: nextValue }
                          : currentItem
                      )));
                    }}
                    className="key-name-input"
                    type="text"
                    placeholder={t("settings.providerConfig.keyName", { index: index + 1 })}
                  />
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      setApiKeys((current) => (
                        current.length === 1
                          ? [createEmptyApiKey(0)]
                          : current.filter((_, currentIndex) => currentIndex !== index)
                      ));
                      setSaveResult(null);
                    }}
                  >
                    {t("settings.providerConfig.deleteKey")}
                  </button>
                </div>

                <ApiKeyInput
                  modelValue={item.value}
                  placeholder="sk-..."
                  onChange={(value) => {
                    setApiKeys((current) => current.map((currentItem, currentIndex) => (
                      currentIndex === index
                        ? { ...currentItem, value }
                        : currentItem
                    )));
                  }}
                />

                <div className="config-actions">
                  <button
                    className="btn btn-sm"
                    disabled={validatingKeyId === item.id || !item.value.trim() || item.value.includes("...")}
                    type="button"
                    onClick={() => void handleValidate(index)}
                  >
                    {validatingKeyId === item.id ? t("settings.providerConfig.validating") : t("settings.providerConfig.validate")}
                  </button>
                  {validationResults[item.id] === true && (
                    <span className="valid-mark">{t("settings.providerConfig.valid")}</span>
                  )}
                  {validationResults[item.id] === false && (
                    <span className="invalid-mark">{t("settings.providerConfig.invalid")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canDetectOAuth && (
            <div className="field-group">
              <label className="field-label">{t("settings.providerConfig.oauthTokenLabel")}</label>
              <ApiKeyInput
                modelValue={oauthToken}
                placeholder={config.providerId === "anthropic" ? "sk-ant-oat01-..." : "eyJ..."}
                onChange={setOauthToken}
              />
              <div className="config-actions">
                <button className="btn btn-sm btn-detect" disabled={detecting} type="button" onClick={() => void handleDetectToken()}>
                  {detecting ? t("settings.providerConfig.detecting") : t("settings.providerConfig.detect")}
                </button>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => void handleOpenOauthMethod()}>
                  {t("settings.providerConfig.getMethod")}
                </button>
              </div>
              {detectResult && <div className="detect-result">{detectResult}</div>}
              <div className="field-hint">
                {config.providerId === "anthropic" ? (
                  <>
                    {t("settings.providerConfig.detectAnthropicHintAuto")} <code>~/.claude/.credentials.json</code><br />
                    {t("settings.providerConfig.detectAnthropicHintManual")} <code>claude</code>
                  </>
                ) : (
                  <>
                    {t("settings.providerConfig.detectOpenAIHintAuto")} <code>~/.codex/auth.json</code><br />
                    {t("settings.providerConfig.detectOpenAIHintManual", { command: "codex login" })} <code>codex login --device-auth</code>
                  </>
                )}
              </div>
            </div>
          )}

          {!hasAnyCredential && (
            <div className="field-hint">
              {t("settings.providerConfig.credentialHint")}
            </div>
          )}

          {saveResult && (
            <div className={`save-result ${saveResult.type === "success" ? "is-success" : "is-error"}`}>
              {saveResult.message}
            </div>
          )}

          <div className="footer-actions">
            {isCreateMode ? (
              <>
                <button className="btn btn-sm btn-secondary" type="button" onClick={onCanceled}>
                  {t("common.cancel")}
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={saving || !hasAnyCredential}
                  type="button"
                  onClick={() => void handleSave()}
                >
                  {saveButtonLabel}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={saving || removing}
                  type="button"
                  onClick={() => setShowRemoveDialog(true)}
                >
                  {removing ? t("common.removing") : t("common.remove")}
                </button>
                <button
                  className={`btn btn-sm btn-primary${saveResult?.type === "success" && !hasChanges ? " is-saved" : ""}`}
                  disabled={saving || !hasChanges || !hasAnyCredential}
                  type="button"
                  onClick={() => void handleSave()}
                >
                  {saveButtonLabel}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showRemoveDialog}
        busy={removing}
        message={t("settings.providerConfig.removeConfirmMessage", { providerName: config.displayName })}
        ariaLabel={t("settings.providerConfig.removeConfirmAria")}
        confirmLabel={t("common.remove")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => {
          if (!removing) {
            setShowRemoveDialog(false);
          }
        }}
        onConfirm={() => void handleConfirmRemove()}
      />
    </div>
  );
}
