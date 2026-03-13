export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await browser.sidePanel.open({ tabId: tab.id });
    }
  });

  // Set side panel behavior
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Handle messages
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_DATATABLE') {
      openDataTable(message.payload);
      sendResponse({ status: 'ok' });
      return false;
    }
    return false;
  });
});

async function openDataTable(data: any) {
  // Store data for the popup to read
  await browser.storage.local.set({ datatable_pending: data });

  // Open as a popup window
  browser.windows.create({
    url: browser.runtime.getURL('/datatable.html'),
    type: 'popup',
    width: 1100,
    height: 700,
  });
}
