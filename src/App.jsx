import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import ProjectListScreen from "./screens/ProjectListScreen.jsx";
import AppShell from "./shell/AppShell.jsx";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (user) return <Navigate to="/projects" replace />;
  return children;
}

function FullScreenLoading() {
  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--c-bg-soft)", color: "var(--c-text-muted)", fontSize: 13,
    }}>
      <div style={{
        width: 28, height: 28, marginRight: 12,
        border: "2px solid var(--c-border)",
        borderTopColor: "var(--c-navy-deep)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={
            <PublicRoute><LoginScreen /></PublicRoute>
          } />

          {/* Protected: Projects list */}
          <Route path="/projects" element={
            <ProtectedRoute><ProjectListScreen /></ProtectedRoute>
          } />

          {/* Protected: Inside project (3-area shell) */}
          <Route path="/projects/:projectId/*" element={
            <ProtectedRoute><AppShell /></ProtectedRoute>
          } />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
