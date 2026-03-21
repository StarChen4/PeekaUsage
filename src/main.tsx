import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import "./assets/styles/main.css";

const container = document.getElementById("app");

if (!container) {
  throw new Error("未找到应用挂载节点 #app");
}

createRoot(container).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
