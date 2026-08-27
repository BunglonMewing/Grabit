import {
  CHROME_UA,
  SAFARI_MOBILE_UA,
  getCookiesFromHeaders,
  serializeData,
} from "../utils/index.js";
import { getCleanUrl } from "../utils/urlUtils.js";
import { scraperFetch, createScraperResult } from "./httpHelper.js";

export let _igSource = null;
export function setInstagramSource(src) {
  _igSource = src;
}

async function scrapeInstagramEmbedDirect(cleanUrl) {
  try {
    const shortcodeMatch = cleanUrl.match(
      /(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
    );
    if (!shortcodeMatch) return null;
    const shortcode = shortcodeMatch[1];
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

    const res = await scraperFetch(
      {
        url: embedUrl,
        headers: {
          "User-Agent": SAFARI_MOBILE_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        rawResponse: true,
      },
      "Instagram Direct Embed",
    );

    if (!res || !res.data) return null;
    const htmlText = typeof res.data === "string" ? res.data : String(res.data);
    const unescaped = htmlText.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const idx = unescaped.indexOf('"shortcode_media":');
    if (idx === -1) return null;
    const start = idx + '"shortcode_media":'.length;
    let depth = 0;
    let end = -1;

    for (let i = start; i < unescaped.length; i++) {
      const char = unescaped[i];
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) return null;
    const rawJson = unescaped.slice(start, end);
    const media = JSON.parse(rawJson);

    const caption =
      media.edge_media_to_caption?.edges[0]?.node?.text || "Instagram Media";
    const downloads = [];

    if (media.edge_sidecar_to_children?.edges) {
      media.edge_sidecar_to_children.edges.forEach((edge, i) => {
        const n = edge.node;
        const mediaUrl = n.video_url || n.display_url;
        if (mediaUrl) {
          downloads.push({
            url: mediaUrl,
            type: n.is_video ? "VIDEO" : "IMAGE",
            quality: n.is_video ? `HD Video ${i + 1}` : `HD Photo ${i + 1}`,
            thumbnail: n.display_url || mediaUrl,
          });
        }
      });
    } else {
      const mediaUrl = media.video_url || media.display_url;
      if (mediaUrl) {
        downloads.push({
          url: mediaUrl,
          type: media.is_video ? "VIDEO" : "IMAGE",
          quality: media.is_video ? "HD Video" : "HD Photo",
          thumbnail: media.display_url || mediaUrl,
        });
      }
    }

    if (!downloads.length) return null;
    return createScraperResult(true, {
      title: caption.slice(0, 80),
      thumbnail: downloads[0].thumbnail || downloads[0].url,
      downloads,
      sourceUrl: cleanUrl,
    });
  } catch (err) {
    console.warn("[IG Embed Direct] Failed:", err);
    return null;
  }
}

async function scrapeSnapSave(cleanUrl) {
  try {
    const desktopUA = CHROME_UA;
    const res = await scraperFetch(
      {
        url: "https://snapsave.app/action.php",
        method: "POST",
        data: serializeData({ url: cleanUrl }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": desktopUA,
          "X-Requested-With": "XMLHttpRequest",
          Origin: "https://snapsave.app",
          Referer: "https://snapsave.app/",
        },
        rawResponse: true,
      },
      "SnapSave",
    );

    if (!res || !res.data) {
      console.warn("[SnapSave] res or res.data is empty:", res);
      return null;
    }

    let htmlContent = "";
    const rawData = res.data;

    const extractFromScriptStr = (str) => {
      if (typeof str !== "string") return "";
      let matched = "";
      const idxDouble = str.indexOf('innerHTML = "');
      if (idxDouble !== -1) {
        const start = idxDouble + 'innerHTML = "'.length;
        const lastQuote = str.lastIndexOf('"');
        if (lastQuote > start) {
          const rawString = str.slice(start, lastQuote);
          try {
            matched = (0, eval)('"' + rawString + '"');
          } catch (_) {
            matched = rawString;
          }
        }
      }
      if (!matched) {
        const idxSingle = str.indexOf("innerHTML = '");
        if (idxSingle !== -1) {
          const start = idxSingle + "innerHTML = '".length;
          const lastQuote = str.lastIndexOf("'");
          if (lastQuote > start) {
            const rawString = str.slice(start, lastQuote);
            try {
              matched = (0, eval)("'" + rawString + "'");
            } catch (_) {
              matched = rawString;
            }
          }
        }
      }
      if (!matched) {
        const boxIdx = str.indexOf("<ul class=");
        if (boxIdx !== -1) {
          const endBox = str.lastIndexOf("</ul>");
          if (endBox > boxIdx) {
            matched = str.slice(boxIdx, endBox + 5);
          }
        }
      }
      return matched;
    };

    if (typeof rawData === "string" && rawData.trim().startsWith("<")) {
      htmlContent = rawData;
    } else if (typeof rawData === "string") {
      try {
        const codeToRun = rawData.replace(/\beval\s*\(\s*function/g, "(function");
        const unpackedScript = (0, eval)(codeToRun);
        htmlContent = extractFromScriptStr(unpackedScript) || extractFromScriptStr(rawData);
      } catch (evalErr) {
        console.warn("[SnapSave] Unpack JS failed:", evalErr);
        htmlContent = extractFromScriptStr(rawData);
      }
    }

    if (htmlContent) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const downloadsMap = new Map();

      const getIsImageFromUrlOrText = (urlStr, textStr) => {
        const combined = (urlStr + " " + textStr).toUpperCase();
        if (combined.includes("PHOTO") || combined.includes("GAMBAR") || combined.includes("IMAGE") || combined.includes("ICON-DLIMAGE")) {
          return true;
        }
        if (combined.includes("VIDEO") || combined.includes("ICON-DLVIDEO")) {
          return false;
        }

        try {
          const match = urlStr.match(/token=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
          if (match) {
            const payloadB64 = match[1].split(".")[1];
            const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
            let decoded = "";
            if (typeof atob === "function") {
              decoded = atob(base64);
            } else if (typeof Buffer !== "undefined") {
              decoded = Buffer.from(base64, "base64").toString("utf-8");
            }
            if (/\.(jpe?g|png|webp)(\?|"|$)/i.test(decoded)) return true;
            if (/\.(mp4|mkv|mov|webm)(\?|"|$)/i.test(decoded)) return false;
          }
        } catch (_) {}

        return /\.(jpe?g|png|webp)(\?|$)/i.test(urlStr);
      };

      const addLink = (href, titleAttr, textContent, thumb) => {
        if (
          !href ||
          !href.startsWith("http") ||
          href.includes("snapsave.app") ||
          href.includes("play.google.com") ||
          href.includes("facebook.com")
        )
          return;
        const key = href;
        if (downloadsMap.has(key)) return;

        const isImage = getIsImageFromUrlOrText(href, (titleAttr || "") + " " + (textContent || ""));

        let itemThumb = thumb;
        if (!itemThumb && href.includes("rapidcdn.app")) {
          itemThumb = href.replace("/v2?", "/thumb?").replace("/download?", "/thumb?");
        }

        downloadsMap.set(key, {
          url: href,
          type: isImage ? "IMAGE" : "VIDEO",
          quality: isImage ? "HD Photo" : "HD Video",
          thumbnail: itemThumb,
        });
      };

      const items = doc.querySelectorAll(".download-box > li, .download-items, li");
      const targets = items.length > 0 ? items : [doc];

      targets.forEach((item) => {
        const thumbImg = item.querySelector(".download-items__thumb img, img");
        const thumb = thumbImg ? thumbImg.getAttribute("src") : null;

        const btnLinks = item.querySelectorAll(
          "a.abutton, .download-items__btn a, a[href*='rapidcdn'], a[href*='snapcdn'], a[href*='cdninstagram'], a[href*='fbcdn'], a[href]",
        );

        btnLinks.forEach((a) => {
          const href = a.getAttribute("href");
          const title = a.getAttribute("title") || "";
          const text = a.textContent || "";
          addLink(href, title, text, thumb);
        });

        const options = item.querySelectorAll("select option");
        options.forEach((opt) => {
          const val = opt.getAttribute("value");
          if (!val || !val.startsWith("http") || val.includes("snapsave.app")) return;
          const key = val;
          if (downloadsMap.has(key)) return;

          const qualityLabel = (opt.textContent || "").trim() || "HD";
          const isImage = getIsImageFromUrlOrText(val, qualityLabel);
          downloadsMap.set(key, {
            url: val,
            type: isImage ? "IMAGE" : "VIDEO",
            quality: qualityLabel,
            thumbnail: thumb,
          });
        });
      });

      if (downloadsMap.size === 0) {
        const rawMatches = [...htmlContent.matchAll(/href=\\?["'](http[^"'\\]+)\\?["']/gi)].map((m) => m[1]);
        rawMatches.forEach((href) => {
          addLink(href, "Download", "Download", null);
        });
      }

      const downloads = [...downloadsMap.values()];

      if (downloads.length > 0) {
        const thumbnail = downloads[0].thumbnail || downloads[0].url;
        return createScraperResult(true, {
          title: "Instagram Content",
          thumbnail,
          downloads,
          sourceUrl: cleanUrl,
        });
      }
    }
  } catch (err) {
    console.warn("[SnapSave] Failed:", err);
  }
  return null;
}

export async function scrapeInstagram(url) {
  let currentStatus = null;
  try {
    const cleanUrl = getCleanUrl(url).split("?")[0];
    if (!_igSource) return { requireSource: true };

    if (_igSource === "savevid" || _igSource === "downreels" || _igSource === "snapsave") {
      const snapResult = await scrapeSnapSave(cleanUrl);
      if (snapResult) {
        _igSource = null;
        return snapResult;
      }
      throw new Error("Failed to fetch media from Server 2.");
    }

    if (_igSource === "indown") {
      try {
        const desktopUA = CHROME_UA;
        const acceptHeader =
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";

        const getTokenFromHtml = (htmlStr) => {
          if (!htmlStr || typeof htmlStr !== "string") return null;
          const match =
            htmlStr.match(/name="_token"\s+value="([^"]+)"/i) ||
            htmlStr.match(/value="([^"]+)"\s+name="_token"/i) ||
            htmlStr.match(/_token\s*:\s*["']([^"']+)["']/i);
          return match ? match[1] : null;
        };

        const doAttempt = async (initUrl) => {
          try {
            const r1 = await scraperFetch(
              {
                url: initUrl,
                headers: {
                  "User-Agent": desktopUA,
                  Accept: acceptHeader,
                },
                rawResponse: true,
              },
              "Indown Init",
            );

            let token = getTokenFromHtml(r1 ? r1.data : "");
            let parser = new DOMParser();
            if (!token && r1 && r1.data) {
              const doc1 = parser.parseFromString(r1.data, "text/html");
              token = doc1.querySelector('input[name="_token"]')?.value;
            }
            if (!token) return null;

            const cookies = getCookiesFromHeaders(r1.headers);
            const r2 = await scraperFetch(
              {
                url: "https://indown.io/download",
                method: "POST",
                data: serializeData({
                  link: cleanUrl,
                  _token: token,
                  referer: initUrl,
                  locale: "en",
                }),
                headers: {
                  Cookie: cookies,
                  "Content-Type": "application/x-www-form-urlencoded",
                  "User-Agent": desktopUA,
                  Accept: acceptHeader,
                  Referer: initUrl,
                  Origin: "https://indown.io",
                },
                rawResponse: true,
              },
              "Indown Download",
            );
            currentStatus = r2.status;

            const doc2 = parser.parseFromString(r2.data || "", "text/html");
            const downloadsMap = new Map();

            const addLink = (a) => {
              let href = a.getAttribute("href");
              if (!href || !href.startsWith("http")) return;
              href = href.replace(/&amp;/g, "&");

              if (href.includes("indown.io/fetch") && href.includes("url=")) {
                try {
                  const targetUrl = decodeURIComponent(href.split("url=")[1].split("&")[0]);
                  if (targetUrl.startsWith("http")) {
                    href = targetUrl;
                  }
                } catch (_) {}
              }

              if (href.includes("indown.io")) return;
              if (
                href.includes("facebook.com") ||
                href.includes("twitter.com") ||
                href.includes("google.com") ||
                href.includes("whatsapp.com") ||
                href.includes("telegram") ||
                href.includes("ads")
              )
                return;

              const key = href.split("?")[0];
              if (downloadsMap.has(key)) return;

              const text = (a.textContent || "").toUpperCase();
              const title = (a.getAttribute("title") || "").toUpperCase();
              const combined = href + " " + text + " " + title;

              const isImage =
                /\.(jpe?g|png|webp|gif)(\?|"|$)/i.test(href) ||
                combined.includes("PHOTO") ||
                combined.includes("IMAGE") ||
                combined.includes("GAMBAR");

              const type = isImage ? "IMAGE" : "VIDEO";
              const quality = isImage ? "HD Photo" : "HD Video";

              let itemThumb = isImage ? href : null;
              if (typeof a.closest === "function") {
                const parent = a.closest(".col-md-4, .col-sm-6, .row, div");
                if (parent) {
                  const img = parent.querySelector("img");
                  if (img) {
                    let imgSrc = img.getAttribute("src") || "";
                    if (imgSrc.includes("indown.io/fetch") && imgSrc.includes("url=")) {
                      try {
                        const tUrl = decodeURIComponent(imgSrc.split("url=")[1].split("&")[0]);
                        if (tUrl.startsWith("http")) imgSrc = tUrl;
                      } catch (_) {}
                    }
                    if (!imgSrc.includes("indown.io")) itemThumb = imgSrc;
                  }
                }
              }

              downloadsMap.set(key, { type, quality, url: href, thumbnail: itemThumb || href });
            };

            const btnLinks = doc2.querySelectorAll(
              ".btn-group-vertical a, a.btn-color, a.btn, a[href*='cdninstagram'], a[href*='fbcdn'], a[href*='indown.io/fetch']",
            );
            if (btnLinks.length > 0) {
              btnLinks.forEach(addLink);
            }

            if (downloadsMap.size === 0 && r2 && r2.data) {
              const matches = [...r2.data.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)];
              matches.forEach((m) => {
                const href = m[1];
                const text = m[2].replace(/<[^>]+>/g, "");
                const titleMatch = m[0].match(/title=["']([^"']+)["']/i);
                const title = titleMatch ? titleMatch[1] : "";
                const mockA = {
                  getAttribute: (attr) => (attr === "href" ? href : attr === "title" ? title : null),
                  textContent: text,
                  closest: () => null,
                };
                addLink(mockA);
              });
            }

            const downloads = [...downloadsMap.values()];
            if (downloads.length > 0) {
              let thumbnail = downloads[0].thumbnail || downloads[0].url;
              const video = doc2.querySelector("video.img-fluid");
              if (video) thumbnail = video.getAttribute("poster") || thumbnail;

              return createScraperResult(true, {
                title: "Instagram Content",
                thumbnail,
                downloads,
                sourceUrl: cleanUrl,
              });
            }
          } catch (e) {
            console.warn("[Indown Attempt Exception]:", e);
          }
          return null;
        };

        // Pass 1: /en2
        let indownRes = await doAttempt("https://indown.io/en2");

        // Pass 2: main page fallback if Pass 1 produced no media
        if (!indownRes) {
          await new Promise((r) => setTimeout(r, 250));
          indownRes = await doAttempt("https://indown.io/");
        }

        if (indownRes) {
          _igSource = null;
          return indownRes;
        }
      } catch (err) {
        console.warn("[Indown] Primary passes failed, trying Direct Embed fallback...", err);
      }

      const embedResult = await scrapeInstagramEmbedDirect(cleanUrl);
      if (embedResult) {
        _igSource = null;
        return embedResult;
      }

      throw new Error(
        "Media links not found. Post might be private or invalid.",
      );
    }

    throw new Error("Invalid source selected.");
  } catch (err) {
    _igSource = null;
    return createScraperResult(false, err.message, currentStatus);
  }
}
