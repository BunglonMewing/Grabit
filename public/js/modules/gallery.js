// gallery.js — Gallery page: scan Download/Mori dari storage
import { Filesystem } from "../utils/index.js";

const MORI_ROOT = "Download/Mori";
const PLATFORM_FOLDERS = [
  "YouTube", "TikTok", "Instagram", "Twitter", "Facebook",
  "Threads", "Pinterest", "Bilibili", "Douyin", "RedNote",
  "Spotify", "AppleMusic", "Bandcamp", "Pixiv", "Other", "Mori"
];

let currentFilter = "all";
let allItems = [];

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

  // Tampilkan loading
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;opacity:0.5;font-size:13px">Scanning files...</div>`;
  empty?.classList.add("hidden");

  allItems = await scanMoriFolder();
  renderGallery();
}

async function scanMoriFolder() {
  if (!Filesystem) {
    // Fallback: pakai localStorage jika tidak ada Filesystem
    return getItemsFromHistory();
  }

  const items = [];

  // Scan tiap subfolder platform
  for (const folder of PLATFORM_FOLDERS) {
    const folderPath = `${MORI_ROOT}/${folder}`;
    try {
      const result = await Filesystem.readdir({
        path: folderPath,
        directory: "EXTERNAL_STORAGE",
      });

      const files = result.files || [];
      for (const file of files) {
        const fileName = typeof file === "string" ? file : file.name;
        if (!fileName) continue;

        const lowerName = fileName.toLowerCase();
        const isVideo = lowerName.endsWith(".mp4") || lowerName.endsWith(".mkv") || lowerName.endsWith(".webm");
        const isAudio = lowerName.endsWith(".mp3") || lowerName.endsWith(".m4a") || lowerName.endsWith(".aac") || lowerName.endsWith(".opus") || lowerName.endsWith(".flac");
        const isImage = lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".png") || lowerName.endsWith(".webp") || lowerName.endsWith(".gif");

        if (!isVideo && !isAudio && !isImage) continue;

        const fullPath = `/storage/emulated/0/${folderPath}/${fileName}`;
        const capUrl = window.Capacitor?.convertFileSrc("file://" + fullPath) || ("file://" + fullPath);

        items.push({
          fileName,
          fullPath,
          capUrl,
          platform: folder,
          type: isVideo ? "VIDEO" : isAudio ? "AUDIO" : "IMAGE",
          thumbnail: isVideo || isImage ? capUrl : "",
        });
      }
    } catch (e) {
      // Folder tidak ada, skip
    }
  }

  return items;
}

function getItemsFromHistory() {
  // Fallback jika Filesystem tidak tersedia
  const history = JSON.parse(localStorage.getItem("mori_history") || "[]");
  const items = [];
  for (const item of history) {
    for (const file of item.localFiles || []) {
      if (!file?.path && !file?.uri) continue;
      const fileSrc = file.path || file.uri;
      const type = (file.type || "").toUpperCase() || "VIDEO";
      const capUrl = window.Capacitor?.convertFileSrc("file://" + fileSrc) || fileSrc;
      items.push({
        fileName: fileSrc.split("/").pop(),
        fullPath: fileSrc,
        capUrl,
        platform: "",
        type,
        thumbnail: file.thumbnail || item.localThumbnail || item.thumbnail || "",
      });
    }
  }
  return items;
}

function renderGallery() {
  const grid = document.getElementById("galleryGrid");
  const empty = document.getElementById("galleryEmpty");
  if (!grid) return;

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

  for (const item of filtered) {
    const card = document.createElement("div");
    card.className = "gallery-card";

    const thumb = document.createElement("div");
    thumb.className = "gallery-thumb";

    if (item.type === "IMAGE") {
      const img = document.createElement("img");
      img.src = item.capUrl;
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.style.display = "none"; };
      thumb.appendChild(img);
    } else if (item.type === "VIDEO") {
      // Thumbnail dari video pakai poster frame
      if (item.thumbnail && item.thumbnail !== item.capUrl) {
        const img = document.createElement("img");
        img.src = item.thumbnail;
        img.referrerPolicy = "no-referrer";
        img.onerror = () => { img.style.display = "none"; };
        thumb.appendChild(img);
      }
      const badge = document.createElement("div");
      badge.className = "gallery-type-badge";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      thumb.appendChild(badge);
    } else if (item.type === "AUDIO") {
      const badge = document.createElement("div");
      badge.className = "gallery-type-badge gallery-type-audio";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h3V3h-6z"/></svg>`;
      thumb.appendChild(badge);
    }

    card.appendChild(thumb);

    const title = document.createElement("p");
    title.className = "gallery-card-title";
    // Hapus ekstensi dari nama file
    title.textContent = item.fileName.replace(/\.[^.]+$/, "") || "Untitled";
    title.title = item.fileName;
    card.appendChild(title);

    // Klik: play video/audio langsung, atau buka image
    card.addEventListener("click", () => openItem(item));
    grid.appendChild(card);
  }
}

function openItem(item) {
  window.dispatchEvent(new CustomEvent("mori_gallery_open_item", {
    detail: {
      title: item.fileName.replace(/\.[^.]+$/, ""),
      thumbnail: item.thumbnail || "",
      url: item.fullPath,
      localFiles: [{
        path: item.fullPath,
        uri: item.fullPath,
        type: item.type,
        thumbnail: item.thumbnail || "",
      }],
      localUri: item.fullPath,
    }
  }));
          }
