// gallery.js — Gallery page: scan Download/Grabit dari storage
import { Filesystem } from "../utils/index.js";

const PLATFORM_FOLDERS = [
  "", "/YouTube", "/TikTok", "/Instagram", "/Twitter", "/Facebook",
  "/Pinterest", "/Spotify", "/AppleMusic", "/Threads", "/RedNote",
  "/Bilibili", "/Pixiv", "/Bandcamp", "/Douyin", "/Other",
];
const DIRECTORIES = ["EXTERNAL_STORAGE", "DOCUMENTS", "EXTERNAL"];

let currentFilter = "all";
let allItems = [];
let _intersectionObserver = null;

export function initGallery() {
  const filterBtn = document.getElementById("galleryFilterBtn");
  const filterBar = document.getElementById("galleryFilterBar");

  filterBtn?.addEventListener("click", () => {
    filterBar?.classList.toggle("hidden");
  });

  filterBar?.addEventListener("click", (e) => {
    const chip = e.target.closest(".gallery-filter-chip");
    if (!chip) return;
    filterBar.querySelectorAll(".gallery-filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentFilter = chip.getAttribute("data-filter") || "all";
    renderGallery();
  });
}

export async function refreshGallery() {
  const grid = document.getElementById("galleryGrid");
  const empty = document.getElementById("galleryEmpty");
  if (!grid) return;

  grid.innerHTML = `<div class="gallery-scanning">
    <div class="gallery-scanning-spinner"></div>
    <span>Scanning...</span>
  </div>`;
  empty?.classList.add("hidden");

  allItems = await scanGrabitFolder();
  renderGallery();
}

async function scanGrabitFolder() {
  if (!Filesystem) return [];

  const baseName = localStorage.getItem("grabit_download_path") || localStorage.getItem("mori_download_path") || "Grabit";
  const videoBase = `Download/${baseName}`;
  const musicBase = localStorage.getItem("grabit_music_path") || localStorage.getItem("mori_music_path") || `Music/${baseName}`;

  const items = [];

  for (const base of [videoBase, musicBase]) {
    for (const sub of PLATFORM_FOLDERS) {
      const folderPath = `${base}${sub}`;
      const platform = sub ? sub.replace("/", "") : baseName;

      for (const dir of DIRECTORIES) {
        try {
          const res = await Filesystem.readdir({
            path: folderPath,
            directory: dir,
          }).catch(() => null);

          if (!res || !res.files) continue;

          for (const file of res.files) {
            const fileName = file.name || (typeof file === "string" ? file : "");
            if (!fileName) continue;

            const lower = fileName.toLowerCase();
            const isVideo = lower.endsWith(".mp4") || lower.endsWith(".mkv") || lower.endsWith(".webm");
            const isAudio = lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".opus") || lower.endsWith(".flac");
            const isImage = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp");

            if (!isVideo && !isAudio && !isImage) continue;

            const fileUri = file.uri || `file:///storage/emulated/0/${folderPath}/${fileName}`;
            const filePath = fileUri.replace('file://', '').replace('/storage/emulated/0/', '');
            const capUrl = window.Capacitor?.convertFileSrc
              ? window.Capacitor.convertFileSrc(decodeURIComponent(fileUri))
              : fileUri;

            items.push({
              fileName,
              filePath,
              fileUri,
              capUrl,
              platform,
              directory: dir,
              type: isVideo ? "VIDEO" : isAudio ? "AUDIO" : "IMAGE",
            });
          }

          break;
        } catch (e) {}
      }
    }
  }

  return items;
}

function renderGallery() {
  const grid = document.getElementById("galleryGrid");
  const empty = document.getElementById("galleryEmpty");
  if (!grid) return;

  // Disconnect observer lama
  if (_intersectionObserver) {
    _intersectionObserver.disconnect();
    _intersectionObserver = null;
  }

  const filtered = currentFilter === "all"
    ? allItems
    : allItems.filter((item) => {
        if (currentFilter === "video") return item.type === "VIDEO";
        if (currentFilter === "image") return item.type === "IMAGE";
        if (currentFilter === "audio") return item.type === "AUDIO";
        return true;
      });

  grid.innerHTML = "";

  if (filtered.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  // IntersectionObserver untuk lazy load gambar
  _intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          _intersectionObserver.unobserve(img);
        }
      }
    });
  }, { rootMargin: "100px" });

  filtered.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "gallery-card";
    // Stagger animasi masuk
    card.style.animationDelay = `${Math.min(index * 30, 300)}ms`;

    const thumb = document.createElement("div");
    thumb.className = "gallery-thumb";

    if (item.type === "IMAGE") {
      const img = document.createElement("img");
      img.dataset.src = item.capUrl;
      img.src = "";
      img.referrerPolicy = "no-referrer";
      img.alt = item.fileName;
      img.onerror = () => {
        img.style.display = "none";
        thumb.classList.add("gallery-thumb--broken");
      };
      thumb.appendChild(img);
      _intersectionObserver.observe(img);
    }

    if (item.type === "VIDEO") {
      // Gradient overlay + badge
      const overlay = document.createElement("div");
      overlay.className = "gallery-thumb-overlay";
      const badge = document.createElement("div");
      badge.className = "gallery-type-badge";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      thumb.appendChild(overlay);
      thumb.appendChild(badge);
      thumb.classList.add("gallery-thumb--video");
    } else if (item.type === "AUDIO") {
      const overlay = document.createElement("div");
      overlay.className = "gallery-thumb-overlay";
      const badge = document.createElement("div");
      badge.className = "gallery-type-badge gallery-type-audio";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h3V3h-6z"/></svg>`;
      thumb.appendChild(overlay);
      thumb.appendChild(badge);
      thumb.classList.add("gallery-thumb--audio");
    }

    // Platform chip kecil di pojok kanan atas
    if (item.platform && item.platform !== "Grabit") {
      const platformChip = document.createElement("span");
      platformChip.className = "gallery-platform-chip";
      platformChip.textContent = item.platform;
      thumb.appendChild(platformChip);
    }

    card.appendChild(thumb);

    const title = document.createElement("p");
    title.className = "gallery-card-title";
    title.textContent = item.fileName.replace(/\.[^.]+$/, "");
    title.title = item.fileName.replace(/\.[^.]+$/, "");
    card.appendChild(title);

    card.addEventListener("click", () => {
      const rawUri = item.fileUri;
      const capSrc = window.Capacitor?.convertFileSrc
        ? window.Capacitor.convertFileSrc(decodeURIComponent(rawUri))
        : rawUri;

      // Ripple effect saat diklik
      const ripple = document.createElement("div");
      ripple.className = "gallery-ripple";
      thumb.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);

      window.dispatchEvent(new CustomEvent("grabit_gallery_open_item", {
        detail: {
          title: item.fileName.replace(/\.[^.]+$/, ""),
          thumbnail: item.type === "IMAGE" ? capSrc : "",
          url: rawUri,
          localFiles: [{
            path: decodeURIComponent(rawUri).replace("file://", ""),
            uri: rawUri,
            type: item.type,
            thumbnail: item.type === "IMAGE" ? capSrc : "",
          }],
          localUri: rawUri,
        }
      }));
    });

    grid.appendChild(card);
  });
              }
