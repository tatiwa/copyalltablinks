const test = require("node:test");
const assert = require("node:assert/strict");

global.chrome = {
  action: {
    onClicked: {
      addListener: () => {},
    },
  },
  tabs: {
    TAB_ID_NONE: -1,
    query: async () => [],
  },
  scripting: {
    executeScript: () => {},
  },
};

const { createCopyAllLinkHelpers } = require("./service-worker.js");

const { detectJiraIssueKey, buildLinkPayload, buildTabListPayload } = createCopyAllLinkHelpers();

test("detects Jira key from path segment when host contains jira", () => {
  const url = "https://jira.internal.example.com/browse/OPS-42";
  assert.equal(detectJiraIssueKey(url), "OPS-42");
});

test("detects Jira key from query parameter when host contains jira", () => {
  const url = "https://jira.example.com/issues/?selectedIssue=OPS-77";
  assert.equal(detectJiraIssueKey(url), "OPS-77");
});

test("ignores key-like token when host lacks jira", () => {
  const url = "https://wiki.example.com/OPS-99";
  assert.equal(detectJiraIssueKey(url), null);
});

test("buildTabListPayload renders Jira formatting and favicon for explicit title", () => {
  const url = "https://jira.company.com/browse/OPS-55";
  const tabs = [
    {
      title: "OPS-55 Improve logging",
      url,
      faviconDataUri: "data:image/png;base64,AAA",
    },
  ];

  const { html, text } = buildTabListPayload(tabs);
  assert.equal(html, '<ul><li><img src="data:image/png;base64,AAA" alt="" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"><a href="https://jira.company.com/browse/OPS-55">OPS-55</a> Improve logging</li></ul>');
  assert.equal(text, "OPS-55 Improve logging (https://jira.company.com/browse/OPS-55)");
});

test("buildTabListPayload keeps plain formatting when detection skipped", () => {
  const url = "https://docs.example.com/OPS-10";
  const tabs = [
    {
      title: "",
      url,
      faviconDataUri: null,
    },
  ];

  const { html, text } = buildTabListPayload(tabs);
  assert.equal(html, `<ul><li><a href="${url}">${url}</a></li></ul>`);
  assert.equal(text, `${url} (${url})`);
});
