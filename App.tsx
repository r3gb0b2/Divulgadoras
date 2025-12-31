
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';
import StateSelection from './pages/StateSelection';
import CampaignSelection from './pages/CampaignSelection';
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
import AppleInstallTutorial from './pages/AppleInstallTutorial';
import RegisterF1 from './pages/RegisterF1';
import GlobalGuestListCheck from './pages/GlobalGuestListCheck';
import ClubVipHome from './pages/ClubVipHome';
import ClubVipHowItWorks from './pages/ClubVipHowItWorks';
import ClubVipStatus from './pages/ClubVipStatus';
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
  const location = useLocation();

  const handleLogout = async () => {
      try {
          await auth.signOut();
          setIsMenuOpen(false); 
          navigate('/admin/login');
      } catch (error) {
          console.error("Logout failed", error);
      }
  };

  // Detecta se estamos no fluxo do Clube VIP
  const isVipContext = location.pathname.startsWith('/clubvip');
  
  const homePath = isVipContext ? '/clubvip' : '/';
  const howItWorksPath = isVipContext ? '/clubvip/como-funciona' : '/como-funciona';
  const statusPath = isVipContext ? '/clubvip/status' : '/status';

  return (
      <header className="bg-secondary shadow-md sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
              <Link to={homePath} className="flex items-center" onClick={() => setIsMenuOpen(false)}>
                  <LogoIcon className="h-10 md:h-12 w-auto text-white" />
                  {isVipContext && <span className="ml-3 px-2 py-0.5 bg-primary text-[10px] font-black text-white rounded uppercase tracking-widest hidden sm:block">VIP</span>}
              </Link>
              
              <div className='hidden md:flex items-center space-x-4'>
                  <OrganizationSwitcher />
                  <Link to={homePath} className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Início</Link>
                  <Link to={howItWorksPath} className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Como Funciona</Link>
                  <Link to={statusPath} className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Status</Link>
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
                      <Link to={homePath} onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Início</Link>
                      <Link to={howItWorksPath} onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Como Funciona</Link>
                      <Link to={statusPath} onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Status</Link>
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
                {/* Rotas de Admin */}
                <Route path="/admin/*" element={<AdminAuth />} />

                {/* Rotas Públicas */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/como-funciona" element={<HowToUsePage />} />
                <Route path="/status" element={<StatusCheck />} />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
                <Route path="/suporte" element={<SupportPage />} />
                <Route path="/planos" element={<PricingPage />} />
                <Route path="/apple-test" element={<AppleTestRegistration />} />
                <Route path="/apple-test/tutorial" element={<AppleInstallTutorial />} />
                <Route path="/registrar-f1" element={<RegisterF1 />} />
                <Route path="/subscribe/:planId" element={<SubscriptionFlowPage />} />
                
                {/* Clube VIP - Página Separada */}
                <Route path="/clubvip" element={<ClubVipHome />} />
                <Route path="/clubvip/como-funciona" element={<ClubVipHowItWorks />} />
                <Route path="/clubvip/status" element={<ClubVipStatus />} />
                
                {/* Divulgadoras */}
                <Route path="/posts" element={<PostCheck />} />
                <Route path="/connect/:loopId?" element={<FollowLoopPage />} />
                <Route path="/proof/:assignmentId" element={<ProofUploadPage />} />
                <Route path="/listas/:campaignId" element={<GuestListCheck />} />
                <Route path="/post-unico/:postId" element={<OneTimePostPage />} />
                <Route path="/leave-group" element={<LeaveGroupPage />} />
                <Route path="/global-list/:listId" element={<GlobalGuestListCheck />} />

                {/* FLUXO DE CADASTRO EM PASSOS */}
                <Route path="/:organizationId" element={<StateSelection />} />
                <Route path="/:organizationId/:state" element={<CampaignSelection />} />
                <Route path="/:organizationId/:state/:campaignName/register" element={<RegistrationForm />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
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
