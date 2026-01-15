
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
import ClubVipTestHome from './pages/ClubVipTestHome';
import ClubVipHowItWorks from './pages/ClubVipHowItWorks';
import ClubVipStatus from './pages/ClubVipStatus';
import GreenlifeHome from './pages/GreenlifeHome';
import GreenlifeStatus from './pages/GreenlifeStatus';
import GreenlifeMetricsPage from './pages/GreenlifeMetricsPage';
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

  const isVipContext = location.pathname.startsWith('/clubvip') || location.pathname.startsWith('/test/clubvip');
  const isGreenlifeContext = location.pathname.startsWith('/alunosgreenlife');
  
  let homePath = '/';
  let statusPath = '/status';

  if (isVipContext) {
      homePath = location.pathname.startsWith('/test') ? '/test/clubvip' : '/clubvip';
      statusPath = '/clubvip/status';
  } else if (isGreenlifeContext) {
      homePath = '/alunosgreenlife';
      statusPath = '/alunosgreenlife/status';
  }

  return (
      <header className="bg-secondary shadow-md sticky top-0 z-50 pt-[env(safe-area-inset-top)] border-b border-white/5">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
              <Link to={homePath} className="flex items-center" onClick={() => setIsMenuOpen(false)}>
                  <LogoIcon className="h-10 md:h-12 w-auto text-white" />
                  {isVipContext && <span className={`ml-3 px-2 py-0.5 ${location.pathname.startsWith('/test') ? 'bg-orange-600' : 'bg-primary'} text-[10px] font-black text-white rounded uppercase tracking-widest hidden sm:block`}>
                    {location.pathname.startsWith('/test') ? 'TESTE PAGAR.ME' : 'VIP'}
                  </span>}
                  {isGreenlifeContext && <span className="ml-3 px-2 py-0.5 bg-green-600 text-[10px] font-black text-white rounded uppercase tracking-widest hidden sm:block">Greenlife</span>}
              </Link>
              
              <div className='hidden md:flex items-center space-x-6'>
                  <OrganizationSwitcher />
                  <Link to={homePath} className="text-gray-300 hover:text-primary font-black uppercase text-[10px] tracking-widest transition-colors">Início</Link>
                  <Link to={statusPath} className="text-gray-300 hover:text-primary font-black uppercase text-[10px] tracking-widest transition-colors">Meus Ingressos</Link>
                  <Link to="/admin" className="px-4 py-2 bg-white/5 border border-white/10 text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-white/10 transition-all">Painel Admin</Link>
              </div>

              <div className="md:hidden flex items-center">
                  <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-gray-400 hover:text-white">
                      {isMenuOpen ? <XIcon className="h-8 w-8" /> : <MenuIcon className="h-8 w-8" />}
                  </button>
              </div>
          </nav>

          {/* Menu Mobile Retrátil */}
          {isMenuOpen && (
              <div className="md:hidden bg-secondary border-t border-white/5 py-6 px-8 space-y-6 animate-slideDown shadow-2xl">
                  <Link to={homePath} className="block text-gray-200 hover:text-primary font-black uppercase text-sm tracking-widest" onClick={() => setIsMenuOpen(false)}>Início</Link>
                  <Link to={statusPath} className="block text-gray-200 hover:text-primary font-black uppercase text-sm tracking-widest" onClick={() => setIsMenuOpen(false)}>Status</Link>
                  <Link to="/admin" className="block text-gray-200 hover:text-primary font-black uppercase text-sm tracking-widest" onClick={() => setIsMenuOpen(false)}>Admin</Link>
                  {adminData && (
                      <button onClick={handleLogout} className="w-full text-left text-red-500 font-black uppercase text-sm tracking-widest pt-4 border-t border-white/5">Sair da Conta</button>
                  )}
              </div>
          )}
      </header>
  );
};

const App: React.FC = () => {
  useEffect(() => {
      return () => { clearPushListeners(); }
  }, []);

  return (
    <AdminAuthProvider>
      <Router>
        <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col pb-[env(safe-area-inset-bottom)]">
          <Header />
          <main className="container mx-auto p-4 md:p-8 flex-grow">
            <ErrorBoundary>
              <Routes>
                <Route path="/admin/*" element={<AdminAuth />} />
                <Route path="/" element={<PublicHome />} />
                <Route path="/status" element={<StatusCheck />} />
                <Route path="/como-funciona" element={<HowToUsePage />} />
                <Route path="/planos" element={<PricingPage />} />
                <Route path="/suporte" element={<SupportPage />} />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
                
                {/* Comprovação e Posts */}
                <Route path="/posts" element={<PostCheck />} />
                <Route path="/proof/:assignmentId" element={<ProofUploadPage />} />
                <Route path="/post-unico/:postId" element={<OneTimePostPage />} />
                <Route path="/sair-do-grupo" element={<LeaveGroupPage />} />
                <Route path="/connect/:loopId" element={<FollowLoopPage />} />
                
                {/* Listas e Inscrições Especiais */}
                <Route path="/listas/:campaignId" element={<GuestListCheck />} />
                <Route path="/global-list/:listId" element={<GlobalGuestListCheck />} />
                <Route path="/f1/register" element={<RegisterF1 />} />
                <Route path="/apple-test" element={<AppleTestRegistration />} />
                <Route path="/apple-test/tutorial" element={<AppleInstallTutorial />} />

                {/* Clube VIP */}
                <Route path="/clubvip" element={<ClubVipHome />} />
                <Route path="/clubvip/status" element={<ClubVipStatus />} />
                <Route path="/test/clubvip" element={<ClubVipTestHome />} />

                {/* Greenlife */}
                <Route path="/alunosgreenlife" element={<GreenlifeHome />} />
                <Route path="/alunosgreenlife/status" element={<GreenlifeStatus />} />
                <Route path="/admin/greenlife-metrics/:token" element={<GreenlifeMetricsPage />} />

                {/* Inscrição Dinâmica */}
                <Route path="/admin/register" element={<SubscriptionFlowPage />} />
                <Route path="/:organizationId" element={<StateSelection />} />
                <Route path="/:organizationId/:state" element={<CampaignSelection />} />
                <Route path="/:organizationId/:state/:campaignName/register" element={<RegistrationForm />} />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </Router>
    </AdminAuthProvider>
  );
};

export default App;
