import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar.jsx';
import { Footer } from './Footer.jsx';
import { Spinner } from '../ui/Spinner.jsx';

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Spinner size="lg" />
  </div>
);

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f3ede2] text-slate-900">
      <Navbar />
      <main className="flex-1 pt-16">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
