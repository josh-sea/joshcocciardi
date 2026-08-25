import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { KidProvider } from './contexts/KidContext';
import AuthGuard from './components/Auth/AuthGuard';
import Login from './components/Auth/Login';
import Header from './components/Layout/Header';
import Navigation from './components/Layout/Navigation';
import LibraryPage from './components/Library/LibraryPage';
import CapturePage from './components/Capture/CapturePage';
import ReaderPage from './components/Reader/ReaderPage';
import GrownupsPage from './components/Grownups/GrownupsPage';
import WordBankPage from './components/WordBank/WordBankPage';

// Chrome around the authenticated, kid-facing pages.
const AppLayout = ({ children }) => (
  <div className="min-h-screen bg-indigo-50">
    <Header />
    <main className="pb-20">{children}</main>
    <Navigation />
  </div>
);

// Grown-up screens: same auth, no bottom kid-nav.
const PlainLayout = ({ children }) => (
  <div className="min-h-screen bg-indigo-50">{children}</div>
);

const protectedApp = (el) => (
  <AuthGuard><AppLayout>{el}</AppLayout></AuthGuard>
);
const protectedPlain = (el) => (
  <AuthGuard><PlainLayout>{el}</PlainLayout></AuthGuard>
);

function App() {
  return (
    <Router basename="/projects/workbook">
      <AuthProvider>
        <KidProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={protectedApp(<LibraryPage />)} />
            <Route path="/capture" element={protectedApp(<CapturePage />)} />
            <Route path="/read/:pageId" element={protectedApp(<ReaderPage />)} />
            <Route path="/grownups" element={protectedPlain(<GrownupsPage />)} />
            <Route path="/words" element={protectedPlain(<WordBankPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KidProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
