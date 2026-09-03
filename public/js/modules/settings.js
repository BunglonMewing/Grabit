// settings.js — settings UI: theme, toggles, selects, paths, language
import { translations } from "../i18n/index.js";
import {
  CapacitorHttp,
  Filesystem,
  releaseWakeLock,
  requestWakeLock,
  setUtilsState,
  showToast,
  triggerHaptic,
} from "../utils/index.js";
import { setUIState, renderHistory } from "../ui.js";
import { showConfirm } from "./modals.js";
import { onHistoryItemClick, onHistoryDeleteClick } from "./history.js";
import {
  APP_VERSION,
  autoClearHistoryToggle,
  autoClearToggle,
  clearCacheBtn,
  wipeDataBtn,
  reportBugBtn,
  platformVal,
  autoDownloadToggle,
  autoLoopToggle,
  autoPasteToggle,
  autoPlayToggle,
  changeMusicPathBtn,
  changePathBtn,
  currentLang,
  setCurrentLang,
  currentLangDisplay,
  darkModeToggle,
  dataSaverToggle,
  incognitoToggle,
  musicPathVal,
  okConfirmBtn,
  openExternalUrl,
  pathVal,
  wifiOnlyToggle,
} from "./core.js";

// Helper to sync setting to Android SharedPreferences for ShareActivity
export function syncSettingToNative(key, val) {
  if (window.GrabitMainBridge?.saveSetting) {
    try {
      window.GrabitMainBridge.saveSetting(key, String(val));
    } catch (e) {
      console.error("syncSettingToNative error", e);
    }
  }
}

export function syncAllSettingsToNative() {
  const keys = [
    "grabit_lang",
    "grabit_theme",
    "grabit_font",
    "grabit_prefer_server",
    "grabit_download_path",
    "grabit_auto_folder",
    "grabit_filename",
    "grabit_incognito",
    "grabit_auto_download",
    "grabit_wifi_only",
  ];
  keys.forEach((key) => {
    const val = localStorage.getItem(key);
    if (val !== null) {
      syncSettingToNative(key, val);
    }
  });
}

// Init Theme
const savedTheme = localStorage.getItem("grabit_theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
if (darkModeToggle) darkModeToggle.checked = savedTheme === "dark";

darkModeToggle?.addEventListener("change", (e) => {
  const theme = e.target.checked ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("grabit_theme", theme);
  syncSettingToNative("grabit_theme", theme);
  applyColorAccent();
  const lang = translations[currentLang] || translations.en;
  showToast(
    e.target.checked
      ? lang["toast-darkmode-on"] || "Dark mode enabled"
      : lang["toast-darkmode-off"] || "Light mode enabled",
  );
});

// Color Accent Logic
const accentColors = {
  black: { light: "#1a1917", dark: "#fffbf2" },
};

export function applyColorAccent() {
  const theme = localStorage.getItem("grabit_theme") || "light";
  const color = accentColors.black[theme] || "#1a1917";
  document.documentElement.style.setProperty("--primary", color);
}

applyColorAccent();

// Incognito Mode Logic
const isIncognito = localStorage.getItem("grabit_incognito") === "true";
if (incognitoToggle) {
  incognitoToggle.checked = isIncognito;
  incognitoToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_incognito", e.target.checked);
    const lang = translations[currentLang];
    showToast(
      e.target.checked
        ? lang["toast-incognito-on"]
        : lang["toast-incognito-off"],
    );
  });
}

// Data Saver Mode Logic
const isDataSaver = localStorage.getItem("grabit_data_saver") === "true";
if (autoPasteToggle) {
  autoPasteToggle.checked = localStorage.getItem("grabit_auto_paste") !== "false";
  autoPasteToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_paste", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-autopaste-on"] || "Auto-paste enabled"
        : lang["toast-autopaste-off"] || "Auto-paste disabled",
    );
  });
}

if (dataSaverToggle) {
  dataSaverToggle.checked = isDataSaver;
  dataSaverToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_data_saver", e.target.checked);
    const lang = translations[currentLang];
    showToast(
      e.target.checked
        ? lang["toast-datasaver-on"]
        : lang["toast-datasaver-off"],
    );
    renderHistory(onHistoryItemClick, onHistoryDeleteClick);
  });
}

if (autoClearHistoryToggle) {
  autoClearHistoryToggle.checked =
    localStorage.getItem("grabit_autoclear_history") === "true";
  autoClearHistoryToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_autoclear_history", e.target.checked);
    const lang = translations[currentLang];
    showToast(
      e.target.checked
        ? lang["toast-autoclear-history-on"]
        : lang["toast-autoclear-history-off"],
    );
  });
}

const isNativePlatform = window.Capacitor?.isNativePlatform?.();
if (!isNativePlatform) {
  const hapticToggle = document.getElementById("hapticToggle");
  const hapticItem = hapticToggle?.closest(".settings-item");
  if (hapticItem) hapticItem.style.display = "none";
}

// Wi-Fi Only Toggle
if (wifiOnlyToggle) {
  wifiOnlyToggle.checked = localStorage.getItem("grabit_wifi_only") === "true";
  wifiOnlyToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_wifi_only", e.target.checked);
    const lang = translations[currentLang];
    showToast(
      e.target.checked ? lang["toast-wifi-on"] : lang["toast-wifi-off"],
    );
  });
}

// Auto-Download Toggle
if (autoDownloadToggle) {
  autoDownloadToggle.checked =
    localStorage.getItem("grabit_auto_download") === "true";
  autoDownloadToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_download", e.target.checked);
    const lang = translations[currentLang];
    showToast(
      e.target.checked
        ? lang["toast-autodownload-on"]
        : lang["toast-autodownload-off"],
    );
  });
}

// Custom Select Handler for New Settings
function setupCustomSelect(selectId, storageKey, textId, menuId) {
  const select = document.getElementById(selectId);
  const text = document.getElementById(textId);
  const menu = document.getElementById(menuId);
  if (!select || !text || !menu) return;

  const defaultFallback =
    storageKey === "grabit_prefer_server"
      ? "ask"
      : storageKey === "grabit_font"
        ? "display"
        : storageKey === "grabit_anim_speed"
          ? "normal"
          : storageKey === "grabit_text_size"
            ? "medium"
            : storageKey === "grabit_concurrent"
              ? "1"
              : storageKey === "grabit_overwrite"
                ? "rename"
                : storageKey === "grabit_max_retry"
                  ? "3"
                  : storageKey === "grabit_doh"
                    ? "off"
                    : storageKey === "grabit_toast_dur"
                      ? "3"
                      : "default";
  const currentVal = localStorage.getItem(storageKey) || defaultFallback;

  // Update display on load
  const item =
    menu.querySelector(`[data-value="${currentVal}"]`) ||
    menu.querySelector(".dropdown-item");
  if (item) {
    text.textContent = item.textContent;
  }

  select.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpening = menu.classList.contains("hidden");

    // Close other dropdowns
    document.querySelectorAll(".dropdown-menu").forEach((m) => {
      if (m !== menu) m.classList.add("hidden");
    });

    menu.classList.toggle("hidden");

    if (!menu.classList.contains("hidden")) {
      // Reset to natural downward position for calculation
      menu.classList.remove("open-up");

      const rect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // If it would overflow the bottom in its natural state, flip it
      if (rect.bottom > viewportHeight - 20) {
        menu.classList.add("open-up");
      }
    } else {
      // Clean up when closing
      menu.classList.remove("open-up");
    }
  });

  menu.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      const val = item.getAttribute("data-value");
      localStorage.setItem(storageKey, val);
      syncSettingToNative(storageKey, val);
      text.textContent = item.textContent;
      menu.classList.add("hidden");
      menu.classList.remove("open-up"); // Clean up on selection

      if (storageKey === "grabit_accent") applyColorAccent();
      if (storageKey === "grabit_font") applyFont();
      if (storageKey === "grabit_lang") switchLanguage(val);
      if (storageKey === "grabit_anim_speed") applyAnimSpeed();
      if (storageKey === "grabit_text_size") applyTextSize();

      const labelText =
        select.closest(".settings-item")?.querySelector(".settings-title span")
          ?.textContent || "Setting";
      showToast(`${labelText}: ${item.textContent.trim()}`);
    });
  });
}

// Initialize Dropdowns
setupCustomSelect(
  "languageSelect",
  "grabit_lang",
  "currentLangDisplay",
  "languageMenu",
);
setupCustomSelect(
  "filenameSelect",
  "grabit_filename",
  "filenameText",
  "filenameMenu",
);

setupCustomSelect("fontSelect", "grabit_font", "fontText", "fontMenu");
setupCustomSelect(
  "historyLimitSelect",
  "grabit_history_limit",
  "historyLimitText",
  "historyLimitMenu",
);
setupCustomSelect(
  "autoClearDaysSelect",
  "grabit_auto_clear_days",
  "autoClearDaysText",
  "autoClearDaysMenu",
);
setupCustomSelect(
  "autoClearCacheDaysSelect",
  "grabit_auto_clear_cache_days",
  "autoClearCacheDaysText",
  "autoClearCacheDaysMenu",
);

setupCustomSelect(
  "preferServerSelect",
  "grabit_prefer_server",
  "preferServerText",
  "preferServerMenu",
);
setupCustomSelect(
  "batchPhotoModeSelect",
  "grabit_batch_photo_mode",
  "batchPhotoModeText",
  "batchPhotoModeMenu",
);
setupCustomSelect(
  "userAgentSelect",
  "grabit_user_agent",
  "userAgentText",
  "userAgentMenu",
);
setupCustomSelect(
  "requestTimeoutSelect",
  "grabit_request_timeout",
  "requestTimeoutText",
  "requestTimeoutMenu",
);
setupCustomSelect(
  "animSpeedSelect",
  "grabit_anim_speed",
  "animSpeedText",
  "animSpeedMenu",
);
setupCustomSelect(
  "textSizeSelect",
  "grabit_text_size",
  "textSizeText",
  "textSizeMenu",
);
setupCustomSelect(
  "concurrentSelect",
  "grabit_concurrent",
  "concurrentText",
  "concurrentMenu",
);
setupCustomSelect(
  "overwriteSelect",
  "grabit_overwrite",
  "overwriteText",
  "overwriteMenu",
);
setupCustomSelect(
  "maxRetrySelect",
  "grabit_max_retry",
  "maxRetryText",
  "maxRetryMenu",
);
setupCustomSelect("dohSelect", "grabit_doh", "dohText", "dohMenu");

// Hide Progress Bar toggle
const hideProgressToggle = document.getElementById("hideProgressToggle");
if (hideProgressToggle) {
  hideProgressToggle.checked =
    localStorage.getItem("grabit_hide_progress") === "true";
  hideProgressToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_hide_progress", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-hide-progress-on"] || "Download progress bar hidden"
        : lang["toast-hide-progress-off"] || "Download progress bar shown",
    );
  });
}

setupCustomSelect(
  "toastDurSelect",
  "grabit_toast_dur",
  "toastDurText",
  "toastDurMenu",
);

// Download Statistics — read + live update on every file saved
export function updateDlStatsDisplay() {
  const el = document.getElementById("historyDlStatsVal");
  if (!el) return;
  const history = JSON.parse(localStorage.getItem("grabit_history") || "[]");
  const storedCount = parseInt(
    localStorage.getItem("grabit_dl_count") || "0",
    10,
  );
  const count = Math.max(storedCount, history.length);
  el.textContent = count.toLocaleString();
}
updateDlStatsDisplay();
window.addEventListener("grabit_file_saved", () => {
  const history = JSON.parse(localStorage.getItem("grabit_history") || "[]");
  const storedCount = parseInt(
    localStorage.getItem("grabit_dl_count") || "0",
    10,
  );
  const newCount = Math.max(storedCount, history.length) + 1;
  localStorage.setItem("grabit_dl_count", newCount);
  updateDlStatsDisplay();
});

// Reset Settings to Default
const resetSettingsBtn = document.getElementById("resetSettingsBtn");
if (resetSettingsBtn) {
  resetSettingsBtn.addEventListener("click", () => {
    const lang = translations[currentLang] || translations.en;
    showConfirm(
      lang["label-reset-settings"] || "Reset Settings",
      lang["confirm-reset-settings"] ||
        "Reset all settings to their defaults? This will not delete your history or downloaded files.",
      () => {
        // Keys to preserve (history, downloaded file records, stats, incognito)
        const preserve = ["grabit_history", "grabit_dl_count", "grabit_incognito"];
        const preserved = {};
        preserve.forEach((k) => {
          const v = localStorage.getItem(k);
          if (v !== null) preserved[k] = v;
        });
        // Clear all "grabit_ keys
        Object.keys(localStorage)
          .filter((k) => k.startsWith("grabit_"))
          .forEach((k) => localStorage.removeItem(k));
        // Restore preserved keys
        Object.entries(preserved).forEach(([k, v]) =>
          localStorage.setItem(k, v),
        );
        showToast(lang["toast-reset-settings"] || "Settings reset to default");
        // Re-apply UI
        setTimeout(() => location.reload(), 800);
      },
    );
  });
}

// Animation Speed Logic
export function applyAnimSpeed() {
  if (!document.body) return;
  const speed = localStorage.getItem("grabit_anim_speed") || "normal";
  document.body.classList.remove(
    "anim-off",
    "anim-slow",
    "anim-normal",
    "anim-fast",
  );
  document.body.classList.add(`anim-${speed}`);
}
applyAnimSpeed();

export function applyTextSize() {
  const size = localStorage.getItem("grabit_text_size") || "medium";
  const fontSizeMap = { small: "14px", medium: "16px", large: "18px" };
  document.documentElement.style.fontSize = fontSizeMap[size] || "16px";
  document.body.classList.remove("text-small", "text-medium", "text-large");
  document.body.classList.add(`text-${size}`);
}
applyTextSize();

// Compact Mode Logic
const compactModeToggle = document.getElementById("compactModeToggle");
if (compactModeToggle) {
  compactModeToggle.checked =
    localStorage.getItem("grabit_compact_mode") === "true";
  if (compactModeToggle.checked) document.body.classList.add("compact-mode");
  compactModeToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_compact_mode", e.target.checked);
    if (e.target.checked) {
      document.body.classList.add("compact-mode");
    } else {
      document.body.classList.remove("compact-mode");
    }
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-compact-on"] || "Compact mode enabled"
        : lang["toast-compact-off"] || "Compact mode disabled",
    );
  });
}

const autoAnalyzeToggle = document.getElementById("autoAnalyzeToggle");
if (autoAnalyzeToggle) {
  autoAnalyzeToggle.checked =
    localStorage.getItem("grabit_auto_analyze") === "true";
  autoAnalyzeToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_analyze", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-autoanalyze-on"] || "Auto-analyze enabled"
        : lang["toast-autoanalyze-off"] || "Auto-analyze disabled",
    );
  });
}

const autoClearInputToggle = document.getElementById("autoClearInputToggle");
if (autoClearInputToggle) {
  autoClearInputToggle.checked =
    localStorage.getItem("grabit_auto_clear_input") === "true";
  autoClearInputToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_clear_input", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-autoclearinput-on"] || "Auto-clear input enabled"
        : lang["toast-autoclearinput-off"] || "Auto-clear input disabled",
    );
  });
}

const downloadSoundToggle = document.getElementById("downloadSoundToggle");
if (downloadSoundToggle) {
  downloadSoundToggle.checked =
    localStorage.getItem("grabit_download_sound") !== "false";
  downloadSoundToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_download_sound", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-sound-on"] || "Completion sound enabled"
        : lang["toast-sound-off"] || "Completion sound disabled",
    );
  });
}

const autoRetryToggle = document.getElementById("autoRetryToggle");
if (autoRetryToggle) {
  autoRetryToggle.checked = localStorage.getItem("grabit_auto_retry") !== "false";
  autoRetryToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_retry", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-autoretry-on"] || "Auto-retry engine enabled"
        : lang["toast-autoretry-off"] || "Auto-retry engine disabled",
    );
  });
}

const hapticToggle = document.getElementById("hapticToggle");
if (hapticToggle) {
  hapticToggle.checked = localStorage.getItem("grabit_haptic") === "true";
  hapticToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_haptic", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-haptic-on"] || "Haptic vibration enabled"
        : lang["toast-haptic-off"] || "Haptic vibration disabled",
    );
  });
}

const autoFolderToggle = document.getElementById("autoFolderToggle");
if (autoFolderToggle) {
  autoFolderToggle.checked =
    localStorage.getItem("grabit_auto_folder") !== "false";
  autoFolderToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_folder", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-autofolder-on"] || "Platform subfolders enabled"
        : lang["toast-autofolder-off"] || "Platform subfolders disabled",
    );
  });
}

const keepAwakeToggle = document.getElementById("keepAwakeToggle");
if (keepAwakeToggle) {
  keepAwakeToggle.checked = localStorage.getItem("grabit_keep_awake") === "true";
  keepAwakeToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_keep_awake", e.target.checked);
    if (e.target.checked) requestWakeLock();
    else releaseWakeLock();
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-keepawake-on"] || "Keep screen awake enabled"
        : lang["toast-keepawake-off"] || "Keep screen awake disabled",
    );
  });
}

const autoUpdateToggle = document.getElementById("autoUpdateToggle");
if (autoUpdateToggle) {
  autoUpdateToggle.checked =
    localStorage.getItem("grabit_auto_update") !== "false";
  autoUpdateToggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_auto_update", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-autoupdate-on"] || "Auto check updates enabled"
        : lang["toast-autoupdate-off"] || "Auto check updates disabled",
    );
  });
}

const forceIpv4Toggle = document.getElementById("forceIpv4Toggle");
if (forceIpv4Toggle) {
  forceIpv4Toggle.checked = localStorage.getItem("grabit_force_ipv4") === "true";
  forceIpv4Toggle.addEventListener("change", (e) => {
    localStorage.setItem("grabit_force_ipv4", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(
      e.target.checked
        ? lang["toast-forceipv4-on"] || "Force IPv4 enabled"
        : lang["toast-forceipv4-off"] || "Force IPv4 disabled",
    );
  });
}

const headerSpoofingToggle = document.getElementById("he