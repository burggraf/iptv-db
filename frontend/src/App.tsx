import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './hooks/useAuth';
import { isAuthenticated } from './lib/pocketbase';
import AppLayout from './components/AppLayout';
import LoginPage from './components/LoginPage';
import Dashboard from './routes/Dashboard';
import SourceDetail from './routes/SourceDetail';

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
