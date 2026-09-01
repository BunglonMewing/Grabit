// gallery.js — Gallery page: scan Download/Mori dari storage
import { Filesystem } from "../utils/index.js";

const PLATFORM_FOLDERS = [
  "", "/YouTube", "/TikTok", "/Instagram", "/Twitter", "/Facebook",
  "/Pinterest", "/Spotify", "/AppleMusic", "/Threads", "/RedNote",
  "/Bilibili", "/Pixiv", "/Bandcamp", "/Douyin", "/Other",
];
const DIRECTORIES = ["EXTERNAL_STORAGE", "DOCUMENTS", "EXTERNAL"];

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
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;font-size:12px">
    Filesystem: ${!!Filesystem}<br>
    mori_download_path: ${localStorage.getItem("mori_download_path") || "null"}<br>
    Scanning...
  </div>`;

  const baseName = localStorage.getItem("mori_download_path") || "Mori";
  const folderPath = `Download/${baseName}/YouTube`;
  
  let debugText = `folder: ${folderPath}<br>`;
  
  for (const dir of ["EXTERNAL_STORAGE", "DOCUMENTS", "EXTERNAL"]) {
    try {
      const res = await Filesystem.readdir({ path: folderPath, directory: dir }).catch(e => ({ error: e.message }));
      debugText += `${dir}: ${res?.error || JSON.stringify(res?.files?.slice(0,2))}<br>`;
    } catch(e) {
      debugText += `${dir}: CATCH ${e.message}<br>`;
    }
  }
  
  grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;font-size:11px;word-break:break-all">${debugText}</div>`;
  }
async function scanMoriFolder() {
  if (!Filesystem) return [];

  const baseName = localStorage.getItem("mori_download_path") || "Mori";
  const videBase = `Download/${baseName}`;
  const musicBase = localStorage.getItem("mori_music_path") || `Music/${baseName}`;

  const items = [];

  for (const base of [videBase, musicBase]) {
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

            const filePath = `${folderPath}/${fileName}`;
            const fileUri = `file:///storage/emulated/0/${filePath}`;
            const capUrl = window.Capacitor?.convertFileSrc
              ? window.Capacitor.convertFileSrc(fileUri)
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

          // Kalau berhasil, tidak perlu coba directory lain untuk folder ini
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
    }

    if (item.type === "VIDEO") {
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
    title.textContent = item.fileName.replace(/\.[^.]+$/, "");
    card.appendChild(title);

    card.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("mori_gallery_open_item", {
        detail: {
          title: item.fileName.replace(/\.[^.]+$/, ""),
          thumbnail: "",
          url: item.fileUri,
          localFiles: [{
            path: item.filePath,
            uri: item.fileUri,
            type: item.type,
            thumbnail: "",
          }],
          localUri: item.fileUri,
        }
      }));
    });

    grid.appendChild(card);
  }
      }
      
