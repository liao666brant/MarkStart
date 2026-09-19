type WorkerRequest =
  | {
      readonly action: 'openMultipleTabsAndGroup'
      readonly urls: readonly string[]
      readonly groupName: string
    }
  | { readonly action: 'reloadExtension' }

type SendResponse = (response: Readonly<Record<string, unknown>>) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseWorkerRequest(value: unknown): WorkerRequest | undefined {
  if (!isRecord(value)) return undefined

  switch (value['action']) {
    case 'openMultipleTabsAndGroup': {
      const urls = value['urls']
      const groupName = value['groupName']
      return isStringArray(urls) && typeof groupName === 'string'
        ? { action: 'openMultipleTabsAndGroup', urls, groupName }
        : undefined
    }
    case 'reloadExtension':
      return { action: 'reloadExtension' }
    default:
      return undefined
  }
}

function handleOpenMultipleTabsAndGroup(
  request: Extract<WorkerRequest, { readonly action: 'openMultipleTabsAndGroup' }>,
  sendResponse: SendResponse,
): void {
  const tabIds: number[] = []

  void Promise.all(
    request.urls.map(
      (url) =>
        new Promise<void>((resolveCreate) => {
          chrome.tabs.create({ url, active: false }, (tab) => {
            if (!chrome.runtime.lastError && tab.id !== undefined) tabIds.push(tab.id)
            resolveCreate()
          })
        }),
    ),
  ).then(() => {
    const [firstTabId, secondTabId, ...remainingTabIds] = tabIds
    if (firstTabId === undefined || secondTabId === undefined) {
      sendResponse({ success: true, message: 'URL 数量不大于 1，直接打开标签页，不创建标签组' })
      return
    }

    chrome.tabs.group({ tabIds: [firstTabId, secondTabId, ...remainingTabIds] }, (groupId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message })
        return
      }
      chrome.tabGroups.update(groupId, { title: request.groupName, color: 'cyan' }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: true, warning: chrome.runtime.lastError.message })
          return
        }
        sendResponse({ success: true })
      })
    })
  })
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: 'chrome://newtab' })
    void chrome.storage.sync.set({ openInNewTab: true })
  }
})

chrome.runtime.onMessage.addListener((value: unknown, _sender, sendResponse) => {
  const request = parseWorkerRequest(value)
  if (request === undefined) {
    sendResponse({ success: false, error: 'Unknown action' })
    return false
  }

  switch (request.action) {
    case 'openMultipleTabsAndGroup':
      handleOpenMultipleTabsAndGroup(request, sendResponse)
      return true

    case 'reloadExtension':
      chrome.runtime.reload()
      return true
  }
})
