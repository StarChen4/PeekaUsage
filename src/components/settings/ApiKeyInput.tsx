import { useState } from "react";
import { useI18n } from "../../i18n";

type ApiKeyInputProps = {
  modelValue: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export default function ApiKeyInput({
  modelValue,
  placeholder,
  onChange,
}: ApiKeyInputProps) {
  const { t } = useI18n();
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="key-input-wrapper">
      <input
        type={showKey ? "text" : "password"}
        value={modelValue}
        placeholder={placeholder ?? t("settings.providerConfig.apiKeyInputPlaceholder")}
        onChange={(event) => onChange(event.target.value)}
        className="key-input"
        spellCheck={false}
        autoComplete="off"
      />
      <button
        className="toggle-btn"
        onClick={() => setShowKey((value) => !value)}
        title={showKey ? t("common.hide") : t("common.show")}
        type="button"
      >
        {showKey ? t("common.hide") : t("common.show")}
      </button>
    </div>
  );
}
