// gallery.js — Gallery page: scan history for downloaded files

let currentFilter = "all";

export function initGallery() {
  const filterBtn = document.getElementById("galleryFilterBtn");
  const filterBar = document.getElementById("galleryFilterBar");

  filterBtn?.addEventListener("click", () => {
    filterBar?.classList.toggle("hidden");
  });

  filterBar?.addEventListener("click", (e) => {
    const chip = e.target.closest(".gallery-filter-chip");
    if (!chip) return;

    filterBar.querySelectorAll(".gallery-filter-chip").forEach((c) => {
      c.classList.remove("active");
    });
    chip.classList.add("active");
    currentFilter = chip.getAttribute("data-filter") || "all";
    renderGallery();
  });
}

export function refreshGallery() {
  renderGallery();
}

function getGalleryItems() {
  const history = JSON.parse(localStorage.getItem("mori_history") || "[]");
  const items = [];

  for (const item of history) {
    const localFiles = item.localFiles || [];

    if (localFiles.length > 0) {
      for (const file of localFiles) {
        if (!file || (!file.path && !file.uri)) continue;
        items.push({
          historyItem: item,
          file,
          type: (file.type || "").toUpperCase(),
          thumbnail: file.thumbnail || item.localThumbnail || item.thumbnail || "",
          title: file.title || item.title || "",
          timestamp: item.timestamp || 0,
        });
      }
    } else if (item.localUri) {
      const path = item.localUri.toLowerCase();
      const type = path.endsWith(".mp4") ? "VIDEO"
        : (path.endsWith(".mp3") || path.endsWith(".m4a")) ? "AUDIO"
        : "IMAGE";
      items.push({
        historyItem: item,
        file: { path: item.localUri, uri: item.localUri, type },
        type,
        thumbnail: item.localThumbnail || item.thumbnail || "",
        title: item.title || "",
        timestamp: item.timestamp || 0,
      });
    }
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

function openHistoryItem(item) {
  // Dispatch event ke app.js/ui.js yang sudah handle modal
  window.dispatchEvent(new CustomEvent("mori_gallery_open_item", { detail: item }));
}

function renderGallery() {
  const grid = document.getElementById("galleryGrid");
  const empty = document.getElementById("galleryEmpty");
  if (!grid) return;

  const allItems = getGalleryItems();
  const filtered = currentFilter === "all"
    ? allItems
    : allItems.filter((item) => {
        if (currentFilter === "video") return item.type === "VIDEO" || item.type === "MP4";
        if (currentFilter === "image") return item.type === "IMAGE" || item.type === "PHOTO";
        if (currentFilter === "audio") return item.type === "AUDIO" || item.type === "MP3";
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

    const isVideo = item.type === "VIDEO" || item.type === "MP4";
    const isAudio = item.type === "AUDIO" || item.type === "MP3";

    // Thumbnail
    const thumb = document.createElement("div");
    thumb.className = "gallery-thumb";

    if (item.thumbnail) {
      const img = document.createElement("img");
      img.src = item.thumbnail;
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.style.display = "none"; };
      thumb.appendChild(img);
    }

    // Type badge
    if (isVideo) {
      const badge = document.createElement("div");
      badge.className = "gallery-type-badge";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      thumb.appendChild(badge);
    } else if (isAudio) {
      const badge = document.createElement("div");
      badge.className = "gallery-type-badge gallery-type-audio";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h3V3h-6z"/></svg>`;
      thumb.appendChild(badge);
    }

    card.appendChild(thumb);

    const title = document.createElement("p");
    title.className = "gallery-card-title";
    title.textContent = item.title || "Untitled";
    card.appendChild(title);

    card.addEventListener("click", () => openHistoryItem(item.historyItem));
    grid.appendChild(card);
  }
        }
