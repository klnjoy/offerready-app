import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { initErrorReporting } from "./lib/errorReport";
import { initPwa } from "./lib/pwa";
import { RouterProvider } from "./lib/router";
import { UpdateToast } from "./components/UpdateToast";
import "./styles.css";

// First, so errors during startup are reported too.
initErrorReporting();
// Install prompt everywhere; the service worker in production builds only.
initPwa(!!import.meta.env.PROD);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider>
      <AuthProvider>
        <App />
        <UpdateToast />
      </AuthProvider>
    </RouterProvider>
  </StrictMode>,
);
