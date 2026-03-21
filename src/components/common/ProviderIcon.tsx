import type { CSSProperties } from "react";
import { useI18n } from "../../i18n";
import type { ProviderId } from "../../types/provider";
import openaiIcon from "../../assets/provider-icons/openai.svg";
import anthropicIcon from "../../assets/provider-icons/anthropic.png";
import openrouterIcon from "../../assets/provider-icons/openrouter.jpeg";

type ProviderIconProps = {
  providerId: ProviderId;
  size?: number;
};

const iconSrcMap: Record<ProviderId, string> = {
  openai: openaiIcon,
  anthropic: anthropicIcon,
  openrouter: openrouterIcon,
};

const iconAltMap: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
};

export default function ProviderIcon({
  providerId,
  size = 18,
}: ProviderIconProps) {
  const { t } = useI18n();
  const iconStyle: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
  };

  return (
    <span className={`provider-icon is-${providerId}`} style={iconStyle} aria-hidden="true">
      <img
        src={iconSrcMap[providerId]}
        alt={t("providerIcon.alt", { providerName: iconAltMap[providerId] })}
      />
    </span>
  );
}
