
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';
import StateSelection from './pages/StateSelection';
import PublicHome from './pages/PublicHome';
import HowToUsePage from './pages/HowToUsePage';
import PricingPage from './pages/PricingPage';
import SubscriptionFlowPage from './pages/AdminRegistrationPage';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { LogoIcon, MenuIcon, XIcon, LogoutIcon } from './components/Icons';
import PostCheck from './pages/PostCheck';
import { GuestListCheck } from './pages/GuestListCheck';
import ProofUploadPage from './pages/ProofUploadPage';
import ErrorBoundary from './components/ErrorBoundary';
import OneTimePostPage from './pages/OneTimePostPage';
import { auth } from './firebase/config';
import LeaveGroupPage from './pages/LeaveGroupPage';
import FollowLoopPage from './pages/FollowLoopPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SupportPage from './pages/SupportPage';
import AppleTestRegistration from './pages/AppleTestRegistration';
import { clearPushListeners } from './services/pushService';

const OrganizationSwitcher: React.FC = () => {
    const { organizationsForAdmin, selectedOrgId, setSelectedOrgId, adminData, loading } = useAdminAuth();

    if (loading || !adminData || adminData.role === 'superadmin' || !organizationsForAdmin || organizationsForAdmin.length <= 1 || !selectedOrgId) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300 hidden sm:inline">Organização:</span>
            <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full md:w-auto px-3 py-1.5 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm bg-gray-700 text-gray-200"
            >
                {organizationsForAdmin.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                ))}
            </select>
        </div>
    );
};

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { adminData } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
      try {
          await auth.signOut();
          setIsMenuOpen(false); 
          navigate('/admin/login');
      } catch (error) {
          console.error("Logout failed", error);
      }
  };

  return (
      <header className="bg-secondary shadow-md sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
              <Link to="/" className="flex items-center" onClick={() => setIsMenuOpen(false)}>
                  <LogoIcon className="h-8 w-auto text-white" />
              </Link>
              
              <div className='hidden md:flex items-center space-x-4'>
                  <OrganizationSwitcher />
                  <Link to="/" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Início</Link>
                  <Link to="/como-funciona" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Como Funciona</Link>
                  <Link to="/status" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Status</Link>
                  <Link to="/admin" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Admin</Link>
                  {adminData && (
                      <button onClick={handleLogout} className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                          <LogoutIcon className="h-5 w-5" />
                          <span>Sair</span>
                      </button>
                  )}
              </div>

              <div className="md:hidden flex items-center">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                  >
                      <span className="sr-only">Abrir menu</span>
                      {isMenuOpen ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
                  </button>
              </div>
          </nav>

          {isMenuOpen && (
              <div className="md:hidden bg-secondary border-b border-gray-700" id="mobile-menu">
                  <div className="px-2 pt-2 pb-4 space-y-2 sm:px-3">
                      <div className="px-2 pb-3 mb-2 border-b border-gray-700">
                          <OrganizationSwitcher />
                      </div>
                      <Link to="/" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Início</Link>
                      <Link to="/como-funciona" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Como Funciona</Link>
                      <Link to="/status" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Status</Link>
                      <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Admin</Link>
                      {adminData && (
                          <button onClick={handleLogout} className="w-full text-left flex items-center gap-2 text-red-400 hover:text-red-500 px-3 py-2 rounded-md text-base font-medium">
                              <LogoutIcon className="h-5 w-5" />
                              <span>Sair</span>
                          </button>
                      )}
                  </div>
              </div>
          )}
      </header>
  );
};


const App: React.FC = () => {
  useEffect(() => {
      return () => {
          clearPushListeners();
      }
  }, []);

  return (
    <AdminAuthProvider>
      <Router>
        <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col pb-[env(safe-area-inset-bottom)]">
          <Header />
          <main className="container mx-auto p-4 md:p-8 flex-grow">
            <ErrorBoundary>
              <Routes>
                {/* 1. ROTAS ESTÁTICAS E PÁGINAS GERAIS (Prioridade Alta) */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/como-funciona" element={<HowToUsePage />} />
                <Route path="/status" element={<StatusCheck />} />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
                <Route path="/suporte" element={<SupportPage />} />
                <Route path="/planos" element={<PricingPage />} />
                <Route path="/subscribe/:planId" element={<SubscriptionFlowPage />} />
                
                {/* 2. ROTAS DE ADMIN (Antes das dinâmicas para evitar conflito com :organizationId) */}
                <Route path="/admin/*" element={<AdminAuth />} />
                
                {/* 3. FUNCIONALIDADES DE DIVULGADORAS */}
                <Route path="/posts" element={<PostCheck />} />
                <Route path="/apple-test" element={<AppleTestRegistration />} />
                <Route path="/connect/:loopId?" element={<FollowLoopPage />} />
                <Route path="/proof/:assignmentId" element={<ProofUploadPage />} />
                <Route path="/listas/:campaignId" element={<GuestListCheck />} />
                <Route path="/post-unico/:postId" element={<OneTimePostPage />} />
                <Route path="/leave-group" element={<LeaveGroupPage />} />

                {/* 4. ROTAS DINÂMICAS DE ORGANIZAÇÃO (Captura tudo que não bateu acima) */}
                <Route path="/:organizationId/apple-test" element={<AppleTestRegistration />} />
                <Route path="/:organizationId/register/:state/:campaignName?" element={<RegistrationForm />} />
                <Route path="/:organizationId" element={<StateSelection />} />
              </Routes>
            </ErrorBoundary>
          </main>
          <footer className="text-center py-6 text-gray-400 text-sm mt-auto">
              <p>
                  &copy; {new Date().getFullYear()} Equipe Certa. Todos os direitos reservados. 
                  <span className="mx-2">|</span> 
                  <Link to="/politica-de-privacidade" className="hover:text-white underline">Privacidade</Link>
                  <span className="mx-2">|</span> 
                  <Link to="/suporte" className="hover:text-white underline">Suporte</Link>
              </p>
          </footer>
        </div>
      </Router>
    </AdminAuthProvider>
  );
};

export default App;
