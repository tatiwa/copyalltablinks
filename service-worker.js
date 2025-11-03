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
      };
    })
    .filter(Boolean);

  if (tabsToCopy.length === 0) {
    console.error("No tabs with URLs available to copy.");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyLinksToClipboard,
      args: [tabsToCopy],
      world: "MAIN",
    });
  } catch (error) {
    console.error("Failed to write tab list to clipboard", error);
  }
});

async function copyLinksToClipboard(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    throw new Error("No tabs provided for copying.");
  }

  const { html, text } = buildTabListPayload(tabs);

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

  function buildTabListPayload(tabList) {
    const htmlItems = [];
    const textItems = [];

    for (const current of tabList) {
      if (!current || !current.url) continue;
      const safeTitle = (current.title || current.url).trim();
      const { html, text } = buildLinkPayload(safeTitle, current.url);
      htmlItems.push(`<li>${html}</li>`);
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

  function buildLinkPayload(currentTitle, currentUrl) {
    const issueKey = detectJiraIssueKey(currentUrl, currentTitle);

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

  // Stricter Jira key detection: only Jira-like hosts + strict KEY_RE
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
}
