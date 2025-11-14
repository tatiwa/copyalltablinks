const copyAllLinkHelpers = createCopyAllLinkHelpers();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) {
    console.error("No active tab to copy from.");
    return;
  }
  if (tab.windowId === undefined) {
    console.error("Unable to determine current window.");
    return;
  }

  let tabsInWindow;
  try {
    tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });
  } catch (error) {
    console.error("Failed to query tabs for the window.", error);
    return;
  }

  const tabsToCopy = tabsInWindow
    .map((currentTab) => {
      const url = currentTab.url || currentTab.pendingUrl;
      if (!url) return null;
      return {
        title: currentTab.title || url,
        url,
        favIconUrl: currentTab.favIconUrl,
      };
    })
    .filter(Boolean);

  if (tabsToCopy.length === 0) {
    console.error("No tabs with URLs available to copy.");
    return;
  }

  const tabsWithFavicons = await Promise.all(
    tabsToCopy.map(async (tabInfo) => {
      const faviconDataUri = await resolveFaviconDataUri(tabInfo).catch(() => null);
      return { ...tabInfo, faviconDataUri };
    })
  );
  const { html, text } = copyAllLinkHelpers.buildTabListPayload(tabsWithFavicons);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyTabListPayloadToClipboard,
      args: [html, text],
      world: "MAIN",
    });
  } catch (error) {
    console.error("Failed to write tab list to clipboard", error);
  }
});

async function copyTabListPayloadToClipboard(html, text) {
  if (navigator.clipboard && "write" in navigator.clipboard && window.ClipboardItem) {
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([text], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  } else if (navigator.clipboard && "writeText" in navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    throw new Error("Clipboard API is unavailable in this page.");
  }
}

async function resolveFaviconDataUri(tabInfo) {
  const candidates = collectFaviconCandidates(tabInfo);
  for (const source of candidates) {
    try {
      const dataUri = await convertSourceToPngDataUri(source);
      if (dataUri) {
        return dataUri;
      }
    } catch (error) {
      console.debug("Failed to convert favicon source", source, error);
    }
  }
  return null;
}

function collectFaviconCandidates(tabInfo) {
  const candidates = [];
  if (typeof tabInfo.favIconUrl === "string") {
    candidates.push(tabInfo.favIconUrl);
  }

  if (typeof tabInfo.url === "string") {
    try {
      const parsed = new URL(tabInfo.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        candidates.push(`${parsed.origin}/favicon.ico`);
        const googleFavicon = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(parsed.origin)}`;
        candidates.push(googleFavicon);
      }
    } catch {
      // ignore malformed URLs
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

async function convertSourceToPngDataUri(source) {
  if (!source || typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    const blob = dataUriToBlob(trimmed);
    if (!blob) return null;
    return await convertBlobToPngDataUri(blob);
  }

  let response;
  try {
    response = await fetch(trimmed, {
      credentials: "omit",
      cache: "force-cache",
      redirect: "follow",
      mode: "cors",
    });
  } catch (error) {
    console.debug("Failed to fetch favicon", trimmed, error);
    return null;
  }

  if (!response || !response.ok) {
    return null;
  }

  let blob;
  try {
    blob = await response.blob();
  } catch {
    return null;
  }

  return await convertBlobToPngDataUri(blob);
}

async function convertBlobToPngDataUri(blob) {
  if (!blob || !blob.size) return null;

  if (blob.type === "image/png") {
    return await blobToDataUri(blob);
  }

  let imageBitmap;
  try {
    imageBitmap = await createImageBitmap(blob);
  } catch {
    imageBitmap = null;
  }

  if (!imageBitmap) {
    return null;
  }

  const width = Math.max(1, Math.min(64, imageBitmap.width || 32));
  const height = Math.max(1, Math.min(64, imageBitmap.height || 32));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    imageBitmap.close();
    return null;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close();

  let pngBlob;
  try {
    pngBlob = await canvas.convertToBlob({ type: "image/png" });
  } catch {
    return null;
  }

  return await blobToDataUri(pngBlob);
}

function dataUriToBlob(dataUri) {
  try {
    const matches = dataUri.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!matches) return null;
    const mimeType = matches[1] || "application/octet-stream";
    const isBase64 = !!matches[2];
    const dataPart = matches[3] || "";
    const byteString = isBase64 ? atob(dataPart) : decodeURIComponent(dataPart);
    const buffer = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      buffer[i] = byteString.charCodeAt(i);
    }
    return new Blob([buffer], { type: mimeType });
  } catch {
    return null;
  }
}

async function blobToDataUri(blob) {
  if (!blob) return null;
  if (typeof FileReader === "undefined") {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunks = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const slice = bytes.subarray(offset, offset + chunkSize);
      chunks.push(String.fromCharCode.apply(null, slice));
    }
    const binary = chunks.join("");
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to data URI"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

function createCopyAllLinkHelpers() {
  function buildTabListPayload(tabList) {
    const htmlItems = [];
    const textItems = [];

    for (const current of tabList) {
      if (!current || !current.url) continue;
      const explicitTitle = (current.title || "").trim();
      const displayTitle = explicitTitle || current.url;
      const { html, text } = buildLinkPayload(displayTitle, current.url, Boolean(explicitTitle));
      const faviconHtml = buildFaviconMarkup(current.faviconDataUri);
      htmlItems.push(`<li>${faviconHtml}${html}</li>`);
      textItems.push(text);
    }

    if (!htmlItems.length || !textItems.length) {
      throw new Error("No valid tab entries to copy.");
    }

    return {
      html: `<ul>${htmlItems.join("")}</ul>`,
      text: textItems.join("\n"),
    };
  }

  function buildLinkPayload(currentTitle, currentUrl, hasExplicitTitle) {
    const issueKey = detectJiraIssueKey(currentUrl, hasExplicitTitle ? currentTitle : null);

    if (issueKey) {
      const suffixTitle = normalizeJiraTitle(currentTitle, issueKey);
      const separator = suffixTitle ? " " : "";
      const htmlTitle = suffixTitle ? separator + escapeHtml(suffixTitle) : "";
      const plainTitle = suffixTitle ? separator + suffixTitle : "";

      return {
        html: `<a href="${escapeAttribute(currentUrl)}">${escapeHtml(issueKey)}</a>${htmlTitle}`,
        text: `${issueKey}${plainTitle} (${currentUrl})`,
      };
    }

    return {
      html: `<a href="${escapeAttribute(currentUrl)}">${escapeHtml(currentTitle)}</a>`,
      text: `${currentTitle} (${currentUrl})`,
    };
  }

  function detectJiraIssueKey(currentUrl, currentTitle) {
    const KEY_RE = /\b([A-Z]{2,10}-\d{1,6})\b/;
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      parsed = null;
    }

    if (parsed) {
      const host = parsed.hostname.toLowerCase();
      const hostLooksLikeJira =
        /(^|\.)jira\./i.test(host) ||
        host.endsWith(".atlassian.net") ||
        host === "atlassian.net";

      if (hostLooksLikeJira) {
        const pathMatch = parsed.pathname.match(KEY_RE);
        if (pathMatch) return pathMatch[1];

        if (parsed.search) {
          const queryValues = Array.from(parsed.searchParams.values()).join(" ");
          const queryMatch = queryValues.match(KEY_RE);
          if (queryMatch) return queryMatch[1];
        }
      }
    }

    if (currentTitle) {
      const titleMatch = currentTitle.toUpperCase().match(KEY_RE);
      if (titleMatch) return titleMatch[1];
    }

    return null;
  }

  function normalizeJiraTitle(currentTitle, issueKey) {
    if (!currentTitle) return "";
    let cleanedTitle = currentTitle.replace(/\s*[-|:]?\s*Jira.*$/i, "");
    const issueKeyPattern = new RegExp(`^\\s*\\[?${issueKey}\\]?\\s*[-:|]?\\s*`, "i");
    cleanedTitle = cleanedTitle.replace(issueKeyPattern, "");
    return cleanedTitle.trim();
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return char;
      }
    });
  }

  function escapeAttribute(value) {
    return value.replace(/["']/g, (char) => (char === '"' ? "&quot;" : "&#39;"));
  }

  function buildFaviconMarkup(dataUri) {
    if (!dataUri || typeof dataUri !== "string") return "";
    const trimmed = dataUri.trim();
    if (!trimmed.startsWith("data:image/png")) return "";
    return `<img src="${escapeAttribute(trimmed)}" alt="" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;">`;
  }

  return {
    buildTabListPayload,
    buildLinkPayload,
    detectJiraIssueKey,
    normalizeJiraTitle,
    escapeHtml,
    escapeAttribute,
    buildFaviconMarkup,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createCopyAllLinkHelpers,
  };
}
