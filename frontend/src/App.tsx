import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { isAuthenticated } from './lib/pocketbase';
import AppLayout from './components/AppLayout';
import LoginPage from './components/LoginPage';
import Dashboard from './routes/Dashboard';
import Sources from './routes/Sources';
import SourceDetail from './routes/SourceDetail';
import BrowseChannels from './routes/BrowseChannels';
import BrowseMovies from './routes/BrowseMovies';
import BrowseSeries from './routes/BrowseSeries';
import Settings from './routes/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="dashboard/:id" element={<SourceDetail />} />
        <Route path="sources" element={<Sources />} />
        <Route path="sources/:id" element={<SourceDetail />} />
        <Route path="channels" element={<BrowseChannels />} />
        <Route path="channels/:categoryId" element={<BrowseChannels />} />
        <Route path="movies" element={<BrowseMovies />} />
        <Route path="movies/:categoryId" element={<BrowseMovies />} />
        <Route path="series" element={<BrowseSeries />} />
        <Route path="series/:categoryId" element={<BrowseSeries />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
