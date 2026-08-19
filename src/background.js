chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: 'chrome://newtab' });
    chrome.storage.local.set({ defaultBookmarkId: null });
    chrome.storage.sync.set({ openInNewTab: true });
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    case 'fetchBookmarks':
      chrome.bookmarks.getTree((bookmarks) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        const processedBookmarks = [];
        const visit = (node) => {
          if (node.url) processedBookmarks.push(node);
          node.children?.forEach(visit);
        };
        bookmarks.forEach(visit);
        sendResponse({ bookmarks, processedBookmarks, success: true });
      });
      return true;

    case 'setDefaultBookmarkId':
      chrome.storage.local.set({ defaultBookmarkId: request.defaultBookmarkId }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ success: true });
      });
      return true;

    case 'openMultipleTabsAndGroup':
      handleOpenMultipleTabsAndGroup(request, sendResponse);
      return true;

    case 'reloadExtension':
      chrome.runtime.reload();
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

function handleOpenMultipleTabsAndGroup(request, sendResponse) {
  const { urls, groupName } = request;
  const tabIds = [];

  Promise.all(urls.map(url => new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (!chrome.runtime.lastError) tabIds.push(tab.id);
      resolve();
    });
  }))).then(() => {
    if (tabIds.length <= 1) {
      sendResponse({ success: true, message: 'URL 数量不大于 1，直接打开标签页，不创建标签组' });
      return;
    }

    chrome.tabs.group({ tabIds }, (groupId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      chrome.tabGroups.update(groupId, { title: groupName, color: 'cyan' }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: true, warning: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ success: true });
      });
    });
  });
}
