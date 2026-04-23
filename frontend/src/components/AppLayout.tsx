import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { Settings } from 'lucide-react';
import { pb } from './lib/pocketbase';

const navItems = [
  { to: '/app/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/app/sources', label: 'Sources', icon: '📡' },
  { to: '/app/channels', label: 'Channels', icon: '📺' },
  { to: '/app/movies', label: 'Movies', icon: '🎬' },
  { to: '/app/series', label: 'Series', icon: '📼' },
  { to: '/app/settings', label: 'Settings', icon: '⚙️' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const handleDeleteAllSources = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token;
      }
      const res = await fetch('/api/cascade-delete', {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Server error: ${res.status}`);
      }
    } catch (err) {
      console.error('Delete all sources failed:', err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown error');
      setDeleting(false);
      return;
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    setSettingsOpen(false);
    window.location.reload();
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={`flex flex-col border-r bg-card transition-all duration-200 ${sidebarOpen ? 'w-52' : 'w-16'}`}>
        <div className="flex h-14 items-center border-b px-4">
          {sidebarOpen && <span className="text-lg font-bold">IPTV DB</span>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto rounded p-1 hover:bg-muted"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-2">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="text-base">🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center border-b bg-card px-6">
          <h1 className="text-sm font-medium text-muted-foreground">
            {navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'IPTV DB'}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-md border bg-card shadow-lg z-50">
                  <div className="py-1">
                    <button
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => {
                        setSettingsOpen(false);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      🗑️ Delete All Sources
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Delete All Sources confirmation dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !deleting && setDeleteDialogOpen(false)}>
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Delete All Sources</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete all sources and their related data
              (channels, movies, series, categories, sync jobs).
            </p>
            <p className="mt-3 text-sm font-medium text-destructive">
              This action cannot be undone.
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-destructive">{deleteError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 border"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
                onClick={handleDeleteAllSources}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
