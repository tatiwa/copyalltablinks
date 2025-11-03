## Copy All Tab Links

Copy All Tab Links is a Chrome extension that copies every tab's title and URL from the current window to your clipboard as a formatted list. The clipboard payload includes both rich HTML and plain text versions so the output works in chat tools, notes, and email clients. Jira issue links continue to receive the same smart formatting as the original extension.

### Features
- Copies all tab titles and URLs from the active window in one click
- Produces an HTML unordered list alongside newline-separated plain text
- Retains Jira issue key detection and cleaned-up titles
- Uses the Clipboard API for rich data where supported, with graceful fallback to plain text

### How It Works
When you click the extension button, the background service worker gathers every tab in the current window, builds a list of formatted links, and injects a script into the active tab to write both HTML and plain text representations to the clipboard. Jira URLs are still normalized so the issue key appears first.

### File Overview
- `manifest.json`: Chrome extension manifest (v3) with permissions and service worker entry point
- `service-worker.js`: Aggregates tabs, formats the list, and copies the results to the clipboard
- `README.md`: This documentation file

### Installation
1. Clone or download this folder
2. Go to Chrome Extensions (`chrome://extensions`)
3. Enable Developer Mode
4. Click "Load unpacked" and select the `copyalltablinks` folder

### Usage
Click the extension icon while any tab is active. The titles and URLs for all tabs in the current window will be copied to your clipboard. On JIRA pages, the issue key is highlighted and the rest of the title is tidied.

### License
MIT
