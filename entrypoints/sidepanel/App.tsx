import { useState } from 'react';
import Layout, { type View } from '@/components/Layout';
import ToolsMenu from '@/components/ToolsMenu';
import HistoryPanel from '@/components/HistoryPanel';
import SettingsPanel from '@/components/SettingsPanel';
import ListExtractor from '@/components/tools/ListExtractor';
import PageDetailsExtractor from '@/components/tools/PageDetailsExtractor';
import EmailExtractor from '@/components/tools/EmailExtractor';
import PhoneExtractor from '@/components/tools/PhoneExtractor';
import ImageDownloader from '@/components/tools/ImageDownloader';
import TextExtractor from '@/components/tools/TextExtractor';
import LinkExtractor from '@/components/tools/LinkExtractor';
import TableExtractor from '@/components/tools/TableExtractor';

function App() {
  const [view, setView] = useState<View>('tools');

  const renderContent = () => {
    switch (view) {
      case 'tools':
        return <ToolsMenu onNavigate={setView} />;
      case 'history':
      case 'data':
        return <HistoryPanel />;
      case 'settings':
        return <SettingsPanel onNavigate={setView} />;
      case 'list-extractor':
        return <ListExtractor onNavigate={setView} />;
      case 'page-details-extractor':
        return <PageDetailsExtractor onNavigate={setView} />;
      case 'email-extractor':
        return <EmailExtractor onNavigate={setView} />;
      case 'phone-extractor':
        return <PhoneExtractor onNavigate={setView} />;
      case 'image-downloader':
        return <ImageDownloader onNavigate={setView} />;
      case 'text-extractor':
        return <TextExtractor onNavigate={setView} />;
      case 'link-extractor':
        return <LinkExtractor onNavigate={setView} />;
      case 'table-extractor':
        return <TableExtractor onNavigate={setView} />;
      default:
        return <ToolsMenu onNavigate={setView} />;
    }
  };

  return (
    <Layout currentView={view} onNavigate={setView}>
      {renderContent()}
    </Layout>
  );
}

export default App;
