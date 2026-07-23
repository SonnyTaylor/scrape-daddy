import type { Message, DataTablePayload } from '@/types';

export default defineBackground(() => {
  // Chrome: open the side panel when the extension icon is clicked.
  // Firefox has no sidePanel API (it uses sidebar_action), so guard it.
  if (browser.sidePanel) {
    browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {});
  }

  // Handle messages
  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message.type === 'OPEN_DATATABLE') {
      openDataTable(message.payload);
      sendResponse({ status: 'ok' });
      return false;
    }
    return false;
  });
});

async function openDataTable(data: DataTablePayload) {
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
