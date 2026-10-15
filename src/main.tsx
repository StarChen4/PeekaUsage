import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import { useSettingsStore } from "./stores/settingsStore";
import "./assets/styles/main.css";

const container = document.getElementById("app");

if (!container) {
  throw new Error("未找到应用挂载节点 #app");
}

// 先读取持久化语言，避免英文环境首次启动时短暂闪现中文界面。
void useSettingsStore.getState().loadSettings().then(() => {
  createRoot(container).render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
});
