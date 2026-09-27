import axios from "axios";
import { getReportsPass, reportsLocked } from "../utils/reportsPass";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Reports need the Reports PIN pass as well (see utils/reportsPass.js).
  const reportsPass = getReportsPass();
  if (reportsPass && config.url?.startsWith("/reports/")) config.headers["X-Reports-Pass"] = reportsPass;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 403 && err.response.data?.code === "REPORTS_LOCKED") reportsLocked();
    // The saved login stopped working (logged in on another device, password changed/reset,
    // account disabled, or expired): drop it and go to the login page, saying why. Login, reset
    // and logout calls handle their own 401s.
    const url = err.config?.url || "";
    const ownHandling = ["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password", "/auth/logout"];
    if (err.response?.status === 401 && localStorage.getItem("token") && !ownHandling.some((p) => url.startsWith(p))) {
      localStorage.removeItem("token");
      const reason = err.response.data?.code === "SESSION_REPLACED" ? "reason=other-device" : "expired=1";
      window.location.assign(`/login?${reason}`);
    }
    return Promise.reject(err);
  }
);

export default api;
