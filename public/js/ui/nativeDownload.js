// nativeDownload.js — native download flow with progress toast
import { translations } from "../i18n/index.js";
import {
  showToast,
  triggerHaptic,
  Filesystem,
  CapacitorHttp,
  showDownloadProgressToast,
  updateDownloadProgressToast,
  completeDownloadProgressToast,
  failDownloadProgressToast,
  cancelDownloadProgressToast,
  playCompletionSound,
  requestWakeLock,
  releaseWakeLock,
  checkWifiOnlyGuard,
  autoClearInputBox,
  getUserAgent,
} from "../utils/index.js";
import { currentLang } from "../modules/core.js";
import { scraperFetch } from "../scrapers/httpHelper.js";

export function cancelCurrentDownload() {
  window._grabitDownloadCancelled = true;
  // Dispatch event so history spinner can be cleared
  window.dispatchEvent(new CustomEvent("grabit_download_cancelled"));
}

// Expose globally so the progress toast cancel button can call it
window._grabitCancelDownload = cancelCurrentDownload;

export async function startNativeDownload(
  url,
  type,
  title,
  btn,
  sourceUrl,
  resetCancelFlag = true,
) {
  if (!url || typeof url !== "string" || !url.trim()) {
    showToast(
      translations[currentLang]["label-error"] + ": Invalid download link",
    );
    return;
  }

  if (!(await checkWifiOnlyGuard())) return;

  if (
    url.startsWith("file://") ||
    url.includes("_capacitor_file_") ||
    url.startsWith("content://")
  ) {
    showToast("File is already stored locally");
    return;
  }

  const tauriInvoke =
    window.__TAURI__?.core?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    window.__TAURI__?.invoke;

  if (!Filesystem && !tauriInvoke) {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      a.target = "_blank";
      a.click();
    } catch (_) {
      window.open(url, "_blank");
    }
    return;
  }

  if (resetCancelFlag) {
    window._grabitDownloadCancelled = false;
  }
  // If batch already cancelled, bail immediately
  if (window._grabitDownloadCancelled) return;

  window._grabitActiveDownloadUrl = sourceUrl || url;
  window.dispatchEvent(
    new CustomEvent("grabit_download_started", {
      detail: { url: sourceUrl || url },
    }),
  );

  const progressBar = document.getElementById("progressBar");
  const progressContainer = document.getElementById("progressContainer");
  const originalContent = btn ? btn.innerHTML : "";

  if (window.Capacitor?.getPlatform?.() === "android") {
    try {
      const status = await Filesystem.checkPermissions();
      if (status.publicStorage !== "granted") {
        await Filesystem.requestPermissions().catch(() => {});
      }
    } catch (e) {
      console.warn("Permission check failed", e);
    }
  }

  // Show floating progress toast ONLY AFTER validation and permissions pass
  const platformLabel = (() => {
    const src = (sourceUrl || url || "").toLowerCase();
    if (src.includes("tiktok")) return "TikTok";
    if (src.includes("instagram")) return "Instagram";
    if (src.includes("youtube")) return "YouTube";
    if (src.includes("twitter") || src.includes("x.com")) return "Twitter";
    if (src.includes("facebook")) return "Facebook";
    if (src.includes("pinterest")) return "Pinterest";
    if (src.includes("douyin")) return "Douyin";
    if (src.includes("bilibili") || src.includes("b23.tv")) return "Bilibili";
    if (src.includes("spotify")) return "Spotify";
    if (src.includes("bandcamp")) return "Bandcamp";
    if (src.includes("pixiv") || src.includes("pximg")) return "Pixiv";
    if (src.includes("xiaohongshu") || src.includes("rednote"))
      return "RedNote";
    if (src.includes("threads")) return "Threads";
    if (src.includes("snapchat")) return "Snapchat";
    return "Media";
  })();
  if (window._grabitActiveSimInterval) {
    clearInterval(window._grabitActiveSimInterval);
    window._grabitActiveSimInterval = null;
  }

  const hideProgress = localStorage.getItem("grabit_hide_progress") === "true";
  if (!hideProgress) {
    showDownloadProgressToast(platformLabel, type);
  }
  let progressListener = null;
  let currentProgressVal = 0;
  const updateProgress = (pct, statusText) => {
    if (hideProgress) return;
    if (typeof pct === "number" && !isNaN(pct)) {
      const targetPct = Math.min(
        99,
        Math.max(currentProgressVal, Math.round(pct)),
      );
      currentProgressVal = targetPct;
    }
    if (progressBar) progressBar.style.width = `${currentProgressVal}%`;
    updateDownloadProgressToast(currentProgressVal, statusText);
  };

  try {
    if (btn) btn.disabled = true;
    if (progressContainer) progressContainer.classList.remove("hidden");
    updateProgress(0, "Downloading...");

    // Acquire Wake Lock & Start Native Foreground Service
    requestWakeLock();
    if (window.GrabitMainBridge?.startDownloadService) {
      try {
        window.GrabitMainBridge.startDownloadService(
          `Downloading ${platformLabel} ${type || ""}`,
        );
      } catch (e) {
        console.warn("Foreground service start error", e);
      }
    }

    const initialBadge = btn ? btn.querySelector(".dl-badge") : null;
    if (btn) {
      if (initialBadge) {
        initialBadge.textContent = "...";
      } else {
        btn.innerHTML =
          translations[currentLang]["btn-processing"] || "Processing...";
      }
    }
    console.log("Starting download for:", url);

    let simProgress = 0;
    let realProgressReceived = false;
    window._grabitActiveSimInterval = setInterval(() => {
      if (realProgressReceived) return;
      if (simProgress < 50) {
        simProgress += 6 + Math.random() * 4;
      } else if (simProgress < 80) {
        simProgress += 2.5 + Math.random() * 2.5;
      } else if (simProgress < 95) {
        simProgress += 0.6 + Math.random() * 0.9;
      }
      const currentPct = Math.min(95, Math.round(simProgress));
      updateProgress(currentPct, "Downloading...");
    }, 160);

    // Remove any existing listeners first to avoid double-firing
    if (window._grabitProgressListener) {
      try {
        await window._grabitProgressListener.remove();
      } catch (_) {}
      window._grabitProgressListener = null;
    }

    // Listen for real progress if Filesystem exists
    if (Filesystem?.addListener) {
      try {
        window._grabitProgressListener = await Filesystem.addListener(
          "downloadProgress",
          (progress) => {
            realProgressReceived = true;
            let percentage = 0;
            if (progress.contentLength > 0) {
              percentage = Math.round(
                (progress.bytesWritten / progress.contentLength) * 100,
              );
            } else if (progress.bytesWritten > 0) {
              percentage = Math.min(
                95,
                Math.round(progress.bytesWritten / 10240),
              );
            }

            updateProgress(Math.min(95, percentage), "Downloading...");
          },
        );
      } catch (e) {
        console.warn("Could not attach Filesystem progress listener:", e);
      }
    }

    const isAudio = /mp3|audio|128k|48k|m4a/i.test(type);
    const isImage =
      /image|photo|jpg|png|webp/i.test(type) ||
      /\.(jpg|jpeg|png|webp)/i.test(url);
    let ext = isAudio ? "MP3" : isImage ? "JPG" : "MP4";
    const typeStr = type || "";
    if (/\.png(\?|$)/i.test(url) || typeStr.toLowerCase().includes("png"))
      ext = "PNG";
    if (/\.webp(\?|$)/i.test(url) || typeStr.toLowerCase().includes("webp"))
      ext = "WEBP";
    if (/\.mp4(\?|$)/i.test(url) || typeStr.toLowerCase().includes("video"))
      ext = "MP4";

    const cleanTypeLabel = (type || "")
      .replace(/\s*\[(MP3|MP4|JPG|PNG|WEBP)\]/gi, "")
      .trim();
    const isTrackType = /^\d+\.\s+/.test(cleanTypeLabel);

    let effectiveTitle = title || "Grabit Media";
    if (isTrackType) {
      effectiveTitle =
        cleanTypeLabel.replace(/^\d+\.\s+/, "").trim() || cleanTypeLabel;
    }

    let sanitizedTitle = effectiveTitle
      .replace(/[\\/:*?"<>|#%&{}[\]@$^+=~`';,]/g, "")
      .replace(/[^\w\s\-.\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/gi, "")
      .trim()
      .replace(/\s+/g, " ")
      .substring(0, 60);

    if (!sanitizedTitle) sanitizedTitle = "Grabit_Media";

    const template = localStorage.getItem("grabit_filename") || "title";
    let fileName = `${sanitizedTitle}.${ext}`;

    if (template === "title-platform") {
      let platform = "Media";
      const lowerUrl = (sourceUrl || url || "").toLowerCase();
      if (lowerUrl.includes("tiktok") || lowerUrl.includes("douyin"))
        platform = "TikTok";
      else if (lowerUrl.includes("instagram")) platform = "Instagram";
      else if (lowerUrl.includes("youtube") || lowerUrl.includes("youtu.be"))
        platform = "YouTube";
      else if (lowerUrl.includes("twitter") || lowerUrl.includes("x.com"))
        platform = "Twitter";
      else if (lowerUrl.includes("facebook")) platform = "Facebook";
      else if (lowerUrl.includes("pinterest")) platform = "Pinterest";
      else if (lowerUrl.includes("spotify")) platform = "Spotify";
      else if (lowerUrl.includes("rednote") || lowerUrl.includes("xiaohongshu"))
        platform = "RedNote";
      fileName = `${sanitizedTitle}_${platform}.${ext}`;
    } else if (template === "title-date") {
      const dateStr = new Date().toISOString().split("T")[0];
      fileName = `${sanitizedTitle}_${dateStr}.${ext}`;
    } else if (template === "title") {
      fileName = `${sanitizedTitle}.${ext}`;
    } else {
      // default: Title_Timestamp
      fileName = `${sanitizedTitle}_${Date.now()}.${ext}`;
    }

    const videoSubfolder = localStorage.getItem("grabit_download_path") || "Mori";
    const musicSubfolder =
      localStorage.getItem("grabit_music_path") || "Mori/Music";
    const targetFolder = isAudio ? musicSubfolder : videoSubfolder;
    let fullPath = isAudio
      ? `Download/${musicSubfolder}`
      : `Download/${videoSubfolder}`;

    // Auto-Categorize Subfolder per Platform
    if (localStorage.getItem("grabit_auto_folder") !== "false") {
      const src = (sourceUrl || url || "").toLowerCase();
      let platformFolder = "Other";
      if (
        src.includes("tiktok") ||
        src.includes("douyin") ||
        src.includes("iesdouyin")
      )
        platformFolder = "TikTok";
      else if (src.includes("instagram") || src.includes("instagr.am"))
        platformFolder = "Instagram";
      else if (src.includes("youtube") || src.includes("youtu.be"))
        platformFolder = "YouTube";
      else if (
        src.includes("twitter") ||
        src.includes("x.com") ||
        src.includes("t.co")
      )
        platformFolder = "Twitter";
      else if (
        src.includes("facebook") ||
        src.includes("fb.watch") ||
        src.includes("fb.com")
      )
        platformFolder = "Facebook";
      else if (src.includes("pinterest") || src.includes("pin.it"))
        platformFolder = "Pinterest";
      else if (src.includes("spotify") || src.includes("spoti.fi"))
        platformFolder = "Spotify";
      else if (src.includes("music.apple.com") || src.includes("apple.com"))
        platformFolder = "AppleMusic";
      else if (src.includes("threads.net") || src.includes("threads.com"))
        platformFolder = "Threads";
      else if (
        src.includes("rednote") ||
        src.includes("xiaohongshu") ||
        src.includes("xhslink")
      )
        platformFolder = "RedNote";
      else if (
        src.includes("bilibili") ||
        src.includes("b23.tv") ||
        src.includes("bili.im")
      )
        platformFolder = "Bilibili";
      else if (
        src.includes("pixiv") ||
        src.includes("pximg") ||
        src.includes("pixiv.me")
      )
        platformFolder = "Pixiv";
      else if (src.includes("bandcamp") || src.includes("bandcamp.com"))
        platformFolder = "Bandcamp";

      fullPath = `${fullPath}/${platformFolder}`;
    }

    const directoriesToTry = ["EXTERNAL_STORAGE", "DOCUMENTS", "EXTERNAL"];
    let successfulDir = "EXTERNAL_STORAGE";

    if (Filesystem) {
      for (const dir of directoriesToTry) {
        await Filesystem.mkdir({
          path: fullPath,
          directory: dir,
          recursive: true,
        }).catch((e) => {
          console.warn(`Mkdir on ${dir} failed or exists:`, e);
        });
      }

      // Handle duplicate files based on mori_overwrite setting
      const overwriteMode = localStorage.getItem("grabit_overwrite") || "rename";
      try {
        let checkExist = null;
        for (const dir of directoriesToTry) {
          checkExist = await Filesystem.stat({
            path: fullPath + "/" + fileName,
            directory: dir,
          }).catch(() => null);
          if (checkExist) break;
        }
        if (checkExist) {
          if (overwriteMode === "skip") {
            // File already exists — skip download silently
            return;
          } else if (overwriteMode === "overwrite") {
            // Overwrite: keep same filename, existing file will be replaced
          } else {
            // rename (default): append _1, _2, etc.
            const dotIdx = fileName.lastIndexOf(".");
            const baseName =
              dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
            let counter = 1;
            let newFileName = `${baseName}_${counter}.${ext}`;
            while (true) {
              let exist = null;
              for (const dir of directoriesToTry) {
                exist = await Filesystem.stat({
                  path: fullPath + "/" + newFileName,
                  directory: dir,
                }).catch(() => null);
                if (exist) break;
              }
              if (!exist) {
                fileName = newFileName;
                break;
              }
              counter++;
              newFileName = `${baseName}_${counter}.${ext}`;
            }
          }
        }
      } catch (e) {}
    }

    if (btn) {
      btn.innerHTML =
        translations[currentLang]["btn-processing"] || "Processing...";
    }

    // Check cancel BEFORE starting resolve phase
    if (window._grabitDownloadCancelled) {
      cancelDownloadProgressToast();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
      if (progressContainer) progressContainer.classList.add("hidden");
      return;
    }

    let actualDownloadUrl = url;
    const needsResolving =
      (url.includes("ytdown") ||
        url.includes("worker") ||
        url.includes("soundloaders_resolve:") ||
        url.includes("spotidown_resolve:") ||
        url.includes("applemusic_resolve:") ||
        (url.includes("token=") && url.includes("snapsave"))) &&
      !url
        .toLowerCase()
        .match(/\.(mp4|mp3|m4a|zip|pdf|jpg|jpeg|png|webp)(\?|$)/);

    if (needsResolving) {
      try {
        if (url.startsWith("applemusic_resolve:")) {
          const payloadStr = url.replace("applemusic_resolve:", "");
          const res = await scraperFetch({
            method: "POST",
            url: "https://aplmate.com/action/track",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent":
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
              "X-Requested-With": "XMLHttpRequest",
              Referer: "https://aplmate.com/",
              Origin: "https://aplmate.com",
            },
            data: payloadStr,
          });
          let dd = typeof res === "string" ? JSON.parse(res) : res;
          let dlHtml = (typeof dd === "object" ? dd?.data : dd) || "";
          if (typeof dlHtml !== "string") dlHtml = JSON.stringify(dlHtml);
          const parser = new DOMParser();
          const doc = parser.parseFromString(dlHtml, "text/html");
          let foundLink = "";
          doc.querySelectorAll("a").forEach((a) => {
            const href = a.getAttribute("href");
            const text = a.textContent.trim();
            if (
              href &&
              (href.includes("/dl?token=") || a.classList.contains("abutton"))
            ) {
              if (href.includes("ko-fi.com") || href.includes("premium.html"))
                return;
              if (text.toLowerCase().includes("another song")) return;
              if (!foundLink) {
                foundLink = href.startsWith("http")
                  ? href
                  : "https://aplmate.com" + href;
              }
            }
          });
          if (foundLink) {
            actualDownloadUrl = foundLink;
          } else {
            throw new Error("Could not resolve Apple Music download link");
          }
        } else if (url.startsWith("spotidown_resolve:")) {
          const parts = url.replace("spotidown_resolve:", "").split("|||");
          const payloadStr = parts[0];
          const cookiesStr = parts[1] ? decodeURIComponent(parts[1]) : "";
          const reqHeaders = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": getUserAgent(),
            "X-Requested-With": "XMLHttpRequest",
            Referer: "https://spotidown.app/",
            Origin: "https://spotidown.app",
          };
          if (cookiesStr) reqHeaders["Cookie"] = cookiesStr;

          const res = await CapacitorHttp.post({
            url: "https://spotidown.app/action/track",
            headers: reqHeaders,
            data: payloadStr,
          });
          let dd =
            typeof res.data === "string" ? JSON.parse(res.data) : res.data;
          let dlHtml = (typeof dd === "object" ? dd?.data : dd) || "";
          if (typeof dlHtml !== "string") dlHtml = JSON.stringify(dlHtml);
          const parser = new DOMParser();
          const doc = parser.parseFromString(dlHtml, "text/html");
          let foundLink = "";
          doc.querySelectorAll("a").forEach((a) => {
            const href = a.getAttribute("href");
            const text = a.textContent.trim();
            if (
              href &&
              href.startsWith("http") &&
              !href.includes("premium.html") &&
              !href.includes("ko-fi.com") &&
              text !== "Download Another Song"
            ) {
              if (!foundLink) foundLink = href;
            }
          });
          if (foundLink) {
            actualDownloadUrl = foundLink;
          } else {
            throw new Error("Could not resolve SpotiDown download link");
          }
        } else if (url.startsWith("soundloaders_resolve:")) {
          const parts = url.replace("soundloaders_resolve:", "").split("|||");
          const dataVal = parts[0];
          const tokenVal = parts[1];
          const BASE = "https://soundloaders.app";
          const res = await CapacitorHttp.post({
            url: BASE + "/action/tracks",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "User-Agent":
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
              "X-Requested-With": "XMLHttpRequest",
              Referer: BASE + "/",
              Origin: BASE,
            },
            data:
              "data=" +
              encodeURIComponent(dataVal) +
              "&track_token=" +
              encodeURIComponent(tokenVal),
          });
          let dd =
            typeof res.data === "string" ? JSON.parse(res.data) : res.data;
          let dlHtml = dd?.html || "";
          const match = dlHtml.match(
            /href=["'](https:\/\/dl\.soundloaders\.app\/cdnv1\?token=[^"']+)["']/,
          );
          if (match && match[1]) {
            actualDownloadUrl = match[1];
          } else {
            throw new Error("Could not resolve Soundloaders download link");
          }
        } else 