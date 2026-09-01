import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingBarContainer, useLoadingBar } from 'react-top-loading-bar';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/layout';
import { CompaniesPage } from './pages/crm/CompaniesPage';
import { CompanyDetailPage } from './pages/crm/CompanyDetailPage';
import { ContactsPage } from './pages/crm/ContactsPage';
import { CrmDashboardPage } from './pages/crm/CrmDashboardPage';
import { DealsPage } from './pages/crm/DealsPage';
import { NotesPage } from './pages/crm/NotesPage';
import { TasksPage } from './pages/crm/TasksPage';
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
        <Route path="products" element={<ProductsPage />} />
        <Route path="invoice-series" element={<InvoiceSeriesPage />} />
        {/* Modulul CRM ("Clienți" în UI) — vezi docs/crm-spec.md */}
        <Route path="crm" element={<CrmDashboardPage />} />
        <Route path="crm/contacts" element={<ContactsPage />} />
        <Route path="crm/companies" element={<CompaniesPage />} />
        <Route path="crm/companies/:id" element={<CompanyDetailPage />} />
        <Route path="crm/deals" element={<DealsPage />} />
        <Route path="crm/tasks" element={<TasksPage />} />
        <Route path="crm/notes" element={<NotesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
