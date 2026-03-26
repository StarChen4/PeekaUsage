import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../i18n";
import {
  PROVIDER_MARKER_COLORS,
  normalizeProviderMarkerColor,
  type ProviderApiKeyItem,
  type ProviderConfigItem,
  type ProviderId,
  type ProviderSubscriptionItem,
} from "../../types/provider";
import { activateProviderApiKey, detectOAuthTokens, type DetectedToken, removeProviderConfig, saveProviderConfig, validateApiKey } from "../../utils/ipc";
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
  onEnvironmentChanged?: () => void | Promise<void>;
};

type ProviderConfigView = "apiKeys" | "subscriptions";
type DetectChoiceState = { primary: DetectedToken; secondary: DetectedToken } | null;
type ColorPickerTarget = `apiKey:${string}` | `subscription:${string}` | null;

export default function ProviderConfig(props: ProviderConfigProps) {
  const { config, expanded, mode = "edit", selectableProviders = [], onSaved, onCanceled, onRemoved, onExpandedChange, onProviderChange, onEnvironmentChanged } = props;
  const { t } = useI18n();
  const [apiKeys, setApiKeys] = useState<ProviderApiKeyItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<ProviderSubscriptionItem[]>([]);
  const [activeView, setActiveView] = useState<ProviderConfigView>("apiKeys");
  const [validatingKeyId, setValidatingKeyId] = useState<string | null>(null);
  const [activatingKeyId, setActivatingKeyId] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, boolean | null>>({});
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [detectChoice, setDetectChoice] = useState<DetectChoiceState>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<ColorPickerTarget>(null);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const syncingFromPropsRef = useRef(false);
  const keepSaveResultOnNextSyncRef = useRef(false);

  const isCreateMode = mode === "create";
  const selectedProvider = isCreateMode ? selectableProviders.find((item) => item.providerId === config.providerId) ?? config : config;
  const selectableProviderOptions: Array<SelectOption<ProviderId>> = selectableProviders.map((item) => ({ value: item.providerId, label: item.displayName, providerId: item.providerId }));
  const canDetectOAuth = selectedProvider.capabilities.hasSubscription;

  function defaultKeyName(index: number) { return t("settings.providerConfig.keyName", { index: index + 1 }); }
  function defaultSubscriptionName(index: number) { return t("settings.providerConfig.subscriptionName", { index: index + 1 }); }
  function createId(prefix: string) { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
  function createEmptyApiKey(index: number): ProviderApiKeyItem { return { id: createId("key"), name: defaultKeyName(index), color: normalizeProviderMarkerColor(null, index), value: "", isActiveInEnvironment: false }; }
  function createEmptySubscription(index: number): ProviderSubscriptionItem { return { id: createId("subscription"), name: defaultSubscriptionName(index), color: normalizeProviderMarkerColor(null, index), oauthToken: "", source: null }; }
  function cloneApiKeys(source: ProviderApiKeyItem[]) { return source.length === 0 ? [createEmptyApiKey(0)] : source.map((item, index) => ({ id: item.id || createId("key"), name: item.name || defaultKeyName(index), color: normalizeProviderMarkerColor(item.color, index), value: item.value, isActiveInEnvironment: !!item.isActiveInEnvironment })); }
  function cloneSubscriptions(source: ProviderSubscriptionItem[]) { if (!canDetectOAuth) return []; return source.length === 0 ? [createEmptySubscription(0)] : source.map((item, index) => ({ id: item.id || createId("subscription"), name: item.name || defaultSubscriptionName(index), color: normalizeProviderMarkerColor(item.color, index), oauthToken: item.oauthToken, source: item.source ?? null })); }
  function sanitizedApiKeys(items: ProviderApiKeyItem[]) { return items.map((item, index) => ({ id: item.id, name: item.name.trim() || defaultKeyName(index), color: normalizeProviderMarkerColor(item.color, index), value: item.value.trim() })).filter((item) => item.value.length > 0); }
  function sanitizedSubscriptions(items: ProviderSubscriptionItem[]) { return items.map((item, index) => ({ id: item.id, name: item.name.trim() || defaultSubscriptionName(index), color: normalizeProviderMarkerColor(item.color, index), oauthToken: item.oauthToken.trim(), source: item.source?.trim() || null })).filter((item) => item.oauthToken.length > 0); }
  function clearTransientState() { setValidatingKeyId(null); setActivatingKeyId(null); setValidationResults({}); setDetecting(false); setDetectResult(null); setDetectChoice(null); setShowRemoveDialog(false); setColorPickerTarget(null); }

  const hasAnyCredential = sanitizedApiKeys(apiKeys).length > 0 || sanitizedSubscriptions(subscriptions).length > 0;
  const hasChanges = JSON.stringify({ apiKeys: sanitizedApiKeys(apiKeys), subscriptions: sanitizedSubscriptions(subscriptions) }) !== JSON.stringify({ apiKeys: sanitizedApiKeys(config.apiKeys), subscriptions: sanitizedSubscriptions(config.subscriptions) });
  const saveButtonLabel = saving ? (isCreateMode ? t("settings.providerConfig.adding") : t("common.saving")) : (!isCreateMode && saveResult?.type === "success" && !hasChanges ? t("common.saved") : (isCreateMode ? t("settings.providerConfig.addConfirm") : t("common.save")));

  useEffect(() => { if (!canDetectOAuth && activeView === "subscriptions") setActiveView("apiKeys"); }, [activeView, canDetectOAuth]);
  useEffect(() => { syncingFromPropsRef.current = true; setApiKeys(cloneApiKeys(config.apiKeys)); setSubscriptions(cloneSubscriptions(config.subscriptions)); syncingFromPropsRef.current = false; clearTransientState(); if (keepSaveResultOnNextSyncRef.current) { keepSaveResultOnNextSyncRef.current = false; return; } setSaveResult(null); }, [config, canDetectOAuth]);
  useEffect(() => { if (syncingFromPropsRef.current) return; clearTransientState(); setSaveResult(null); }, [apiKeys, subscriptions]);

  function renderColorPicker(target: ColorPickerTarget, color: string, onSelect: (nextColor: string) => void) {
    const isOpen = colorPickerTarget === target;

    return (
      <div className="color-picker">
        <button
          className={`color-swatch-trigger${isOpen ? " is-open" : ""}`}
          type="button"
          aria-label={t("settings.providerConfig.selectMarkerColor")}
          aria-expanded={isOpen}
          onClick={() => setColorPickerTarget((current) => current === target ? null : target)}
        >
          <span className="color-swatch-trigger-fill" style={{ backgroundColor: color }} />
        </button>
        {isOpen && (
          <div className="color-palette" role="listbox" aria-label={t("settings.providerConfig.markerColorLabel")}>
            {PROVIDER_MARKER_COLORS.map((optionColor) => (
              <button
                key={optionColor}
                className={`color-palette-swatch${color === optionColor ? " is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={color === optionColor}
                title={optionColor}
                onClick={() => {
                  onSelect(optionColor);
                  setColorPickerTarget(null);
                }}
              >
                <span className="color-palette-swatch-fill" style={{ backgroundColor: optionColor }} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function sortDetectedTokens(tokens: DetectedToken[]) {
    const rank: Record<string, number> = { windows: 0, native: 0, wsl: 1 };
    return [...tokens].sort((left, right) => (rank[left.environment] ?? 99) - (rank[right.environment] ?? 99) || left.displaySource.localeCompare(right.displaySource));
  }

  function buildDetectedMessage(token: DetectedToken) {
    const subscriptionType = token.subscriptionType ? t("settings.providerConfig.detectedTokenType", { subscriptionType: token.subscriptionType }) : "";
    return t("settings.providerConfig.detectedToken", { source: token.displaySource, subscriptionType });
  }

  function applyDetectedTokens(tokens: DetectedToken[], addSlotForBoth = false) {
    const ordered = sortDetectedTokens(tokens);
    if (ordered.length === 0) return;
    setSubscriptions((current) => {
      const next = current.length > 0 ? current.map((item) => ({ ...item })) : [createEmptySubscription(0)];
      if (ordered.length === 1) { next[0] = { ...next[0], oauthToken: ordered[0].token, source: ordered[0].displaySource }; return next; }
      if (addSlotForBoth && next.length < 2) next.push(createEmptySubscription(next.length));
      if (next.length < 2) { next[0] = { ...next[0], oauthToken: ordered[0].token, source: ordered[0].displaySource }; return next; }
      next[0] = { ...next[0], oauthToken: ordered[0].token, source: ordered[0].displaySource };
      next[1] = { ...next[1], oauthToken: ordered[1].token, source: ordered[1].displaySource };
      return next;
    });
  }

  async function handleValidate(index: number) {
    const target = apiKeys[index];
    const value = target?.value.trim();
    if (!target || !value || value.includes("...")) return;
    setValidatingKeyId(target.id);
    setValidationResults((current) => ({ ...current, [target.id]: null }));
    try {
      const result = await validateApiKey(config.providerId, value);
      setValidationResults((current) => ({ ...current, [target.id]: result }));
    } catch {
      setValidationResults((current) => ({ ...current, [target.id]: false }));
    } finally {
      setValidatingKeyId(null);
    }
  }

  async function handleDetectToken() {
    if (!canDetectOAuth) return;
    setDetecting(true);
    setDetectResult(null);
    setDetectChoice(null);
    try {
      const tokens = await detectOAuthTokens();
      const found = sortDetectedTokens(config.providerId === "anthropic" ? tokens.anthropic : tokens.openai);
      if (found.length === 0) {
        setDetectResult(t("settings.providerConfig.tokenNotFound"));
        return;
      }
      if (found.length === 1) {
        applyDetectedTokens([found[0]]);
        setDetectResult(buildDetectedMessage(found[0]));
        return;
      }
      if (subscriptions.length >= 2) {
        applyDetectedTokens(found.slice(0, 2));
        setDetectResult(t("settings.providerConfig.detectedMultipleAssigned", { first: found[0].displaySource, second: found[1].displaySource }));
        return;
      }
      setDetectChoice({ primary: found[0], secondary: found[1] });
      setDetectResult(t("settings.providerConfig.detectedMultipleNeedChoice"));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDetectResult(t("settings.providerConfig.detectFailed", { message }));
    } finally {
      setDetecting(false);
    }
  }

  async function handleOpenOauthMethod() {
    const url = OAUTH_METHOD_URLS[config.providerId];
    if (!url) return;
    try {
      await openUrl(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDetectResult(t("settings.providerConfig.openMethodFailed", { message }));
    }
  }

  async function handleSave() {
    if (saving || !hasAnyCredential) return;
    if (!isCreateMode && !hasChanges) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await saveProviderConfig({ providerId: config.providerId, apiKeys: sanitizedApiKeys(apiKeys), subscriptions: sanitizedSubscriptions(subscriptions), enabled: true });
      if (isCreateMode) {
        onSaved?.();
        return;
      }
      keepSaveResultOnNextSyncRef.current = true;
      setSaveResult({ type: "success", message: t("settings.providerConfig.saveSuccess") });
      onSaved?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveResult({ type: "error", message: t("settings.providerConfig.saveFailed", { message }) });
    } finally {
      setSaving(false);
    }
  }

  async function handleActivateApiKey(item: ProviderApiKeyItem) {
    if (isCreateMode || hasChanges || activatingKeyId || saving || removing) return;
    setActivatingKeyId(item.id);
    setSaveResult(null);
    try {
      await activateProviderApiKey(config.providerId, item.id);
      keepSaveResultOnNextSyncRef.current = true;
      setSaveResult({ type: "success", message: t("settings.providerConfig.environmentActivated", { envVar: config.environmentVariableName }) });
      await onEnvironmentChanged?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveResult({ type: "error", message: t("settings.providerConfig.environmentActivateFailed", { message }) });
    } finally {
      setActivatingKeyId(null);
    }
  }

  async function handleConfirmRemove() {
    if (removing) return;
    setRemoving(true);
    setShowRemoveDialog(false);
    setSaveResult(null);
    try {
      await removeProviderConfig(config.providerId);
      onRemoved?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveResult({ type: "error", message: t("settings.providerConfig.removeFailed", { message }) });
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
                  {option ? <><ProviderIcon providerId={option.value as ProviderId} size={18} /><span className="provider-select-text">{option.label}</span></> : <span className="provider-select-text">{t("settings.providerConfig.selectProvider")}</span>}
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
            <button className="collapse-toggle" type="button" aria-expanded={expanded} aria-label={expanded ? t("settings.providerConfig.collapse") : t("settings.providerConfig.expand")} onClick={() => onExpandedChange?.(!expanded)}>
              <svg className={`collapse-icon${expanded ? " is-expanded" : ""}`} viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 4.5L6 8L9.5 4.5" /></svg>
            </button>
          </>
        )}
      </div>

      {(isCreateMode || expanded) && (
        <div className="config-body">
          {canDetectOAuth && (
            <div className="provider-config-tabs" role="tablist" aria-label={t("settings.providerConfig.viewAriaLabel")}>
              <button className={`provider-config-tab${activeView === "apiKeys" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "apiKeys"} onClick={() => setActiveView("apiKeys")}>{t("settings.providerConfig.apiKeyTab")}</button>
              <button className={`provider-config-tab${activeView === "subscriptions" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "subscriptions"} onClick={() => setActiveView("subscriptions")}>{t("settings.providerConfig.subscriptionTab")}</button>
            </div>
          )}

          {(!canDetectOAuth || activeView === "apiKeys") && (
            <div className="field-group">
              <div className="field-row">
                <label className="field-label">{t("settings.providerConfig.apiKeyLabel")}</label>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => { setApiKeys((current) => [...current, createEmptyApiKey(current.length)]); setSaveResult(null); }}>{t("settings.providerConfig.addKey")}</button>
              </div>
              {apiKeys.map((item, index) => (
                <div key={item.id} className="api-key-card">
                  <div className="api-key-header">
                    <div className="name-color-row">
                      <input value={item.name} onChange={(event) => { const nextValue = event.target.value; setApiKeys((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, name: nextValue } : currentItem)); }} className="key-name-input" type="text" placeholder={t("settings.providerConfig.keyName", { index: index + 1 })} />
                      {renderColorPicker(`apiKey:${item.id}`, item.color, (nextColor) => setApiKeys((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, color: nextColor } : currentItem)))}
                    </div>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => { setApiKeys((current) => current.length === 1 ? [createEmptyApiKey(0)] : current.filter((_, currentIndex) => currentIndex !== index)); setSaveResult(null); }}>{t("settings.providerConfig.deleteKey")}</button>
                  </div>
                  <ApiKeyInput modelValue={item.value} placeholder="sk-..." onChange={(value) => setApiKeys((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, value } : currentItem))} />
                  <div className="config-actions">
                    <button className="btn btn-sm" disabled={validatingKeyId === item.id || !item.value.trim() || item.value.includes("...")} type="button" onClick={() => void handleValidate(index)}>{validatingKeyId === item.id ? t("settings.providerConfig.validating") : t("settings.providerConfig.validate")}</button>
                    {validationResults[item.id] === true && <span className="valid-mark">{t("settings.providerConfig.valid")}</span>}
                    {validationResults[item.id] === false && <span className="invalid-mark">{t("settings.providerConfig.invalid")}</span>}
                    {item.isActiveInEnvironment ? <span className="environment-pill">{t("settings.providerConfig.activeEnvironment")}</span> : (
                      <button className="btn btn-sm btn-secondary" disabled={isCreateMode || hasChanges || saving || removing || activatingKeyId === item.id || !item.value.trim()} type="button" onClick={() => void handleActivateApiKey(item)}>
                        {activatingKeyId === item.id ? t("settings.providerConfig.activatingEnvironment") : t("settings.providerConfig.activateEnvironment")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="field-hint">{hasChanges ? t("settings.providerConfig.environmentSaveFirstHint") : t("settings.providerConfig.environmentHint", { envVar: config.environmentVariableName })}</div>
            </div>
          )}

          {canDetectOAuth && activeView === "subscriptions" && (
            <div className="field-group">
              <div className="field-row">
                <label className="field-label">{t("settings.providerConfig.oauthTokenLabel")}</label>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => { setSubscriptions((current) => [...current, createEmptySubscription(current.length)]); setSaveResult(null); }}>{t("settings.providerConfig.addSubscription")}</button>
              </div>
              <div className="config-actions">
                <button className="btn btn-sm btn-detect" disabled={detecting} type="button" onClick={() => void handleDetectToken()}>{detecting ? t("settings.providerConfig.detecting") : t("settings.providerConfig.detect")}</button>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => void handleOpenOauthMethod()}>{t("settings.providerConfig.getMethod")}</button>
              </div>
              {detectResult && <div className="detect-result">{detectResult}</div>}
              {detectChoice && (
                <div className="detect-choice-panel">
                  <div className="field-hint">{t("settings.providerConfig.detectChoiceHint")}</div>
                  <div className="config-actions">
                    <button className="btn btn-sm btn-secondary" type="button" onClick={() => { applyDetectedTokens([detectChoice.primary]); setDetectResult(buildDetectedMessage(detectChoice.primary)); setDetectChoice(null); }}>{t("settings.providerConfig.useDetectedCandidate", { source: detectChoice.primary.displaySource })}</button>
                    <button className="btn btn-sm btn-secondary" type="button" onClick={() => { applyDetectedTokens([detectChoice.secondary]); setDetectResult(buildDetectedMessage(detectChoice.secondary)); setDetectChoice(null); }}>{t("settings.providerConfig.useDetectedCandidate", { source: detectChoice.secondary.displaySource })}</button>
                    <button className="btn btn-sm" type="button" onClick={() => { applyDetectedTokens([detectChoice.primary, detectChoice.secondary], true); setDetectResult(t("settings.providerConfig.detectedMultipleAssigned", { first: detectChoice.primary.displaySource, second: detectChoice.secondary.displaySource })); setDetectChoice(null); }}>{t("settings.providerConfig.useBothDetectedCandidates")}</button>
                  </div>
                </div>
              )}
              {subscriptions.map((item, index) => (
                <div key={item.id} className="api-key-card">
                  <div className="api-key-header">
                    <div className="name-color-row">
                      <input value={item.name} onChange={(event) => { const nextValue = event.target.value; setSubscriptions((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, name: nextValue } : currentItem)); }} className="key-name-input" type="text" placeholder={t("settings.providerConfig.subscriptionName", { index: index + 1 })} />
                      {renderColorPicker(`subscription:${item.id}`, item.color, (nextColor) => setSubscriptions((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, color: nextColor } : currentItem)))}
                    </div>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => { setSubscriptions((current) => current.length === 1 ? [createEmptySubscription(0)] : current.filter((_, currentIndex) => currentIndex !== index)); setSaveResult(null); }}>{t("settings.providerConfig.deleteSubscription")}</button>
                  </div>
                  <ApiKeyInput modelValue={item.oauthToken} placeholder={config.providerId === "anthropic" ? "sk-ant-oat01-..." : "eyJ..."} onChange={(value) => setSubscriptions((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, oauthToken: value } : currentItem))} />
                  {item.source && <div className="field-hint">{t("settings.providerConfig.detectedSource", { source: item.source })}</div>}
                </div>
              ))}
              <div className="field-hint">
                {config.providerId === "anthropic" ? <>{t("settings.providerConfig.detectAnthropicHintAuto")} <code>~/.claude/.credentials.json</code><br />{t("settings.providerConfig.detectAnthropicHintManual")} <code>claude setup-token</code></> : <>{t("settings.providerConfig.detectOpenAIHintAuto")} <code>~/.codex/auth.json</code><br />{t("settings.providerConfig.detectOpenAIHintManual", { command: "codex login" })} <code>codex login --device-auth</code></>}
              </div>
            </div>
          )}

          {!hasAnyCredential && <div className="field-hint">{t("settings.providerConfig.credentialHint")}</div>}
          {saveResult && <div className={`save-result ${saveResult.type === "success" ? "is-success" : "is-error"}`}>{saveResult.message}</div>}

          <div className="footer-actions">
            {isCreateMode ? (
              <>
                <button className="btn btn-sm btn-secondary" type="button" onClick={onCanceled}>{t("common.cancel")}</button>
                <button className="btn btn-sm btn-primary" disabled={saving || !hasAnyCredential} type="button" onClick={() => void handleSave()}>{saveButtonLabel}</button>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-danger" disabled={saving || removing} type="button" onClick={() => setShowRemoveDialog(true)}>{removing ? t("common.removing") : t("common.remove")}</button>
                <button className={`btn btn-sm btn-primary${saveResult?.type === "success" && !hasChanges ? " is-saved" : ""}`} disabled={saving || !hasChanges || !hasAnyCredential} type="button" onClick={() => void handleSave()}>{saveButtonLabel}</button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog open={showRemoveDialog} busy={removing} message={t("settings.providerConfig.removeConfirmMessage", { providerName: config.displayName })} ariaLabel={t("settings.providerConfig.removeConfirmAria")} confirmLabel={t("common.remove")} cancelLabel={t("common.cancel")} variant="danger" onCancel={() => { if (!removing) setShowRemoveDialog(false); }} onConfirm={() => void handleConfirmRemove()} />
    </div>
  );
}
