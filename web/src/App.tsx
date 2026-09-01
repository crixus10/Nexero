import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingBarContainer, useLoadingBar } from 'react-top-loading-bar';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/layout';
import { CustomersPage } from './pages/CustomersPage';
import { InvoiceSeriesPage } from './pages/InvoiceSeriesPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { NewInvoicePage } from './pages/NewInvoicePage';
import { ProductsPage } from './pages/ProductsPage';

export default function App() {
  return (
    <LoadingBarContainer>
      <AppRoutes />
    </LoadingBarContainer>
  );
}

function AppRoutes() {
  const { start, complete } = useLoadingBar({
    color: 'var(--color-primary)',
    shadow: false,
    waitingTime: 400,
    transitionTime: 200,
    height: 2,
  });
  const [firstLoad, setFirstLoad] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (firstLoad) {
      setFirstLoad(false);
      return;
    }
    start('static');
    const timer = setTimeout(() => complete(), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/invoices" replace />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<NewInvoicePage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="invoice-series" element={<InvoiceSeriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
