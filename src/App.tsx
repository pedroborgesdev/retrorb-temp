import { Component, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { ConsolesPage } from './pages/ConsolesPage';
import { ExplorePage } from './pages/ExplorePage';
import { GamePage } from './pages/GamePage';
import { LibraryPage } from './pages/LibraryPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient();
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Interface error', error, info.componentStack); }
  render() {
    if (this.state.failed) return <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6 font-sans text-ink"><h1 className="text-lg">Não foi possível exibir esta página.</h1><p className="text-sm text-muted">Recarregue para tentar novamente. Seus dados locais serão preservados.</p><button onClick={() => location.reload()} className="rounded-md bg-accent px-4 py-2 text-sm text-white">Recarregar</button></div>;
    return this.props.children;
  }
}
export default function App() {
  return <ErrorBoundary><QueryClientProvider client={queryClient}><HashRouter><Routes><Route element={<AppShell />}><Route index element={<HomePage />} /><Route path="explore" element={<ExplorePage />} /><Route path="consoles" element={<ConsolesPage />} /><Route path="game" element={<GamePage />} /><Route path="library" element={<LibraryPage />} /><Route path="favorites" element={<LibraryPage favorites />} /><Route path="downloads" element={<DownloadsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<HomePage />} /></Route></Routes></HashRouter></QueryClientProvider></ErrorBoundary>;
}
