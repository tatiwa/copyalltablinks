## Copy Tab Link

Copy Tab Link is a Chrome extension that allows you to quickly copy the active tab's title and URL as a formatted link to your clipboard. It supports both plain text and rich HTML formats, and provides special formatting for Jira issue links.

### Features
- Copies the active tab's title and URL as a clickable link
- Supports both HTML and plain text clipboard formats
- Detects Jira issue keys and formats them for easy sharing
- Handles clipboard permissions and browser compatibility

### How It Works
When you click the extension button, it grabs the current tab's title and URL, then copies them to your clipboard as a formatted link. If the tab is a Jira issue, it will highlight the issue key and clean up the title for better readability.

### File Overview
- `manifest.json`: Chrome extension manifest (v3), defines permissions and background service worker
- `service-worker.js`: Main logic for copying tab info to clipboard, including Jira detection and formatting
- `README.md`: This documentation file

### Installation
1. Clone or download this folder
2. Go to Chrome Extensions (`chrome://extensions`)
3. Enable Developer Mode
4. Click "Load unpacked" and select the `copytablink` folder

### Usage
Click the extension icon in your browser toolbar while on any tab. The tab's title and URL will be copied to your clipboard as a formatted link. If you're on a Jira issue page, the link will be formatted to highlight the issue key.

### License
MIT
