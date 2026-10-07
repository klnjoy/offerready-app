import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { RouterProvider } from "./lib/router";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </RouterProvider>
  </StrictMode>,
);
