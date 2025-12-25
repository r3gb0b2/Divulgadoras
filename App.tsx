
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import PublicRegistration from './pages/PublicRegistration';
import AdminAuth from './pages/AdminAuth';
// Added missing imports for pages and components
import PublicHome from './pages/PublicHome';
import HowToUsePage from './pages/HowToUsePage';
import StatusCheck from './pages/StatusCheck';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SupportPage from './pages/SupportPage';
import PricingPage from './pages/PricingPage';
import AppleTestRegistration from './pages/AppleTestRegistration';
import AppleInstallTutorial from './pages/AppleInstallTutorial';
import RegisterF1 from './pages/RegisterF1';
import SubscriptionFlowPage from './pages/AdminRegistrationPage';
import PostCheck from './pages/PostCheck';
import ErrorBoundary from './components/ErrorBoundary';
// Added missing context and service imports
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import { clearPushListeners } from './services/pushService';
import { LogoIcon } from './components/Icons';

// FIX: Added Header component which was missing from the snippet
const Header: React.FC = () => {
  return (
    <header className="bg-secondary/60 backdrop-blur-md border-b border-white/5 py-4 sticky top-0 z-50">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          <LogoIcon className="h-8 w-auto" />
        </Link>
        <nav className="flex gap-6">
          <Link to="/posts" className="text-xs font-black uppercase tracking-widest hover:text-primary transition-colors">Tarefas</Link>
          <Link to="/status" className="text-xs font-black uppercase tracking-widest hover:text-primary transition-colors">Status</Link>
          <Link to="/admin" className="text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Admin</Link>
        </nav>
      </div>
    </header>
  );
};

const App: React.FC = () => {
  useEffect(() => {
      return () => {
          // FIX: clearPushListeners is now imported from pushService.ts
          clearPushListeners();
      }
  }, []);

  return (
    // FIX: AdminAuthProvider is now imported from AdminAuthContext.tsx
    <AdminAuthProvider>
      <Router>
        <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col pb-[env(safe-area-inset-bottom)]">
          <Header />
          <main className="container mx-auto p-4 md:p-8 flex-grow">
            {/* FIX: ErrorBoundary is now imported from ErrorBoundary.tsx */}
            <ErrorBoundary>
              <Routes>
                {/* Rotas de Admin com prioridade */}
                <Route path="/admin/*" element={<AdminAuth />} />

                {/* Rotas Públicas Estáticas */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/como-funciona" element={<HowToUsePage />} />
                <Route path="/status" element={<StatusCheck />} />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
                <Route path="/suporte" element={<SupportPage />} />
                <Route path="/planos" element={<PricingPage />} />
                <Route path="/apple-test" element={<AppleTestRegistration />} />
                <Route path="/apple-test/tutorial" element={<AppleInstallTutorial />} />
                <Route path="/registrar-f1" element={<RegisterF1 />} />
                <Route path="/cadastro-vip" element={<PublicRegistration />} />
                <Route path="/subscribe/:planId" element={<SubscriptionFlowPage />} />
                
                {/* Cadastro e Inscrição por Produtora */}
                <Route path="/:organizationId/register/:state" element={<RegistrationForm />} />
                <Route path="/:organizationId/register/:state/:campaignName" element={<RegistrationForm />} />
                
                {/* Divulgadoras */}
                <Route path="/posts" element={<PostCheck />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </Router>
    </AdminAuthProvider>
  );
};

// FIX: Added default export to resolve "Module has no default export" error in index.tsx
export default App;
