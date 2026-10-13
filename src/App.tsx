import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell, MorePage } from '@/components/AppShell';
import { PageLoader } from '@/components/ui';
import { Home } from '@/pages/Home';
import { LoginPage, RegisterPage } from '@/pages/Auth';
import { Dashboard } from '@/pages/Dashboard';
import { PropertiesPage } from '@/pages/Properties';
import { PropertyEditPage } from '@/pages/PropertyEdit';
import { InquiriesPage } from '@/pages/Inquiries';
import { BillingPage } from '@/pages/Billing';
import { ContactsPage } from '@/pages/Contacts';
import { BillsPage } from '@/pages/Bills';
import { BillEditPage } from '@/pages/BillEdit';
import { SiteEditorPage } from '@/pages/SiteEditor';
import { PublicAgentPage, PublicPropertyPage } from '@/pages/Public';

// The calendar is the heaviest screen; load it on demand.
const CalendarPage = lazy(() => import('@/pages/Calendar').then((m) => ({ default: m.CalendarPage })));

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/a/:slug" element={<PublicAgentPage />} />
        <Route path="/a/:slug/p/:id" element={<PublicPropertyPage />} />

        <Route path="/app" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="properties/new" element={<PropertyEditPage />} />
          <Route path="properties/:id" element={<PropertyEditPage />} />
          <Route path="page" element={<SiteEditorPage />} />
          <Route path="inquiries" element={<InquiriesPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="bills/new" element={<BillEditPage />} />
          <Route path="bills/:id" element={<BillEditPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="more" element={<MorePage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="text-6xl font-extrabold text-brand-700">404</div>
        <p className="mt-2 text-stone-500">This page doesn’t exist.</p>
        <a href="/" className="mt-4 inline-block font-semibold text-brand-700 underline">
          Back to Khondo
        </a>
      </div>
    </div>
  );
}
