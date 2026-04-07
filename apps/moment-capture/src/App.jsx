import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import Login from './components/Auth/Login';
import AuthGuard from './components/Auth/AuthGuard';
import ProjectList from './components/Projects/ProjectList';
import CameraCapture from './components/Camera/CameraCapture';
import ReviewQueue from './components/Curation/ReviewQueue';
import GalleryPage from './components/Gallery/GalleryPage';
import CompilationExport from './components/Export/CompilationExport';
import Header from './components/Layout/Header';
import Navigation from './components/Layout/Navigation';

// Layout wrapper for authenticated pages
const AppLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="pb-16">
        {children}
      </main>
      <Navigation />
    </div>
  );
};

function App() {
  return (
    <Router basename="/projects/moments">
      <AuthProvider>
        <ProjectProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route
              path="/projects"
              element={
                <AuthGuard>
                  <AppLayout>
                    <ProjectList />
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/camera"
              element={
                <AuthGuard>
                  <AppLayout>
                    <CameraCapture />
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/review"
              element={
                <AuthGuard>
                  <AppLayout>
                    <ReviewQueue />
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/gallery"
              element={
                <AuthGuard>
                  <AppLayout>
                    <GalleryPage />
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/export"
              element={
                <AuthGuard>
                  <AppLayout>
                    <CompilationExport />
                  </AppLayout>
                </AuthGuard>
              }
            />
            
            {/* Default Route — show ProjectList directly at /projects/moments */}
            <Route
              path="/"
              element={
                <AuthGuard>
                  <AppLayout>
                    <ProjectList />
                  </AppLayout>
                </AuthGuard>
              }
            />
            
            {/* 404 Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProjectProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
