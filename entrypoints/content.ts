import type { Message, ExtractionPayload, ImageFilterPayload, AutoDetectColumnsPayload, AutoScrollPayload } from '@/types';
import { startPicker, stopPicker } from './content/picker';
import { extractListData, autoDetectColumns } from './content/extract-list';
import { extractEmails, extractPhones, extractImages, extractMarkdown, extractLinks, extractTables, extractStructuredData } from './content/extract-page';
import { startAutoScroll, stopAutoScroll } from './content/autoscroll';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      handleMessage(message).then(sendResponse);
      return true; // async response
    });
  },
});

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return { status: 'ok' };

    case 'START_PICKER':
      startPicker();
      return { status: 'picker_started' };

    case 'CANCEL_PICKER':
      stopPicker();
      return { status: 'picker_cancelled' };

    case 'START_EXTRACTION':
      return extractListData(message.payload as ExtractionPayload);

    case 'EXTRACT_EMAILS':
      return extractEmails();

    case 'EXTRACT_PHONES':
      return extractPhones();

    case 'EXTRACT_IMAGES':
      return extractImages(message.payload as ImageFilterPayload | undefined);

    case 'EXTRACT_TEXT':
      return extractMarkdown();

    case 'AUTO_DETECT_COLUMNS':
      return autoDetectColumns((message.payload as AutoDetectColumnsPayload).itemSelector);

    case 'START_AUTOSCROLL': {
      const p = message.payload as AutoScrollPayload | undefined;
      return startAutoScroll(p?.delay || 2000, p?.maxScrolls || 50);
    }

    case 'STOP_AUTOSCROLL':
      stopAutoScroll();
      return { status: 'stopped' };

    case 'EXTRACT_LINKS':
      return extractLinks();

    case 'EXTRACT_TABLES':
      return extractTables();

    case 'EXTRACT_STRUCTURED_DATA':
      return extractStructuredData();

    default:
      return { error: 'Unknown message type' };
  }
}
