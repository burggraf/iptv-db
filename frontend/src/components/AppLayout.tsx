import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';

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

  const handleLogout = () => {
    logout();
    navigate('/');
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
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
