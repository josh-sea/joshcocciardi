import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ShopProvider, useShop } from './contexts/ShopContext';
import AuthGuard from './components/Auth/AuthGuard';
import Login from './components/Auth/Login';
import Header from './components/Layout/Header';
import Navigation from './components/Layout/Navigation';
import LoadingSpinner from './components/Layout/LoadingSpinner';
import ShopSetup from './components/Shop/ShopSetup';
import InventoryPage from './components/Inventory/InventoryPage';
import DashboardPage from './components/Dashboard/DashboardPage';

// Authenticated shell. Until the user belongs to a shop, everything routes to
// the shop-setup screen (create or join). Once they do, they get the app.
const AppLayout = ({ children }) => {
  const { shopsLoading, needsSetup } = useShop();

  if (shopsLoading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <LoadingSpinner label="Opening your shop…" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="min-h-screen bg-slate-100">
        <ShopSetup />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Header />
      <main className="pb-20">{children}</main>
      <Navigation />
    </div>
  );
};

function App() {
  return (
    <Router basename="/projects/collector">
      <AuthProvider>
        <ShopProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <AuthGuard>
                  <AppLayout>
                    <InventoryPage />
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard"
              element={
                <AuthGuard>
                  <AppLayout>
                    <DashboardPage />
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ShopProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
