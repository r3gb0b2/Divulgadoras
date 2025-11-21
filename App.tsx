
import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';
import StateSelection from './pages/StateSelection';
import PricingPage from './pages/PricingPage';
import PublicHome from './pages/PublicHome';
import SubscriptionFlowPage from './pages/AdminRegistrationPage';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { LogoIcon, MenuIcon, XIcon, LogoutIcon } from './components/Icons';
import GeminiPage from './pages/Gemini';
import PostCheck from './pages/PostCheck';
// FIX: Changed to a named import to resolve module export error.
import { GuestListCheck } from './pages/GuestListCheck';
import ProofUploadPage from './pages/ProofUploadPage';
import ErrorBoundary from './components/ErrorBoundary';
import OneTimePostPage from './pages/OneTimePostPage';
import { auth } from './firebase/config';
import LeaveGroupPage from './pages/LeaveGroupPage';
import FollowLoopPage from './pages/FollowLoopPage';

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
          setIsMenuOpen(false); // Close mobile menu if open
          navigate('/admin/login');
      } catch (error) {
          console.error("Logout failed", error);
      }
  };

  return (
      <header className="bg-secondary shadow-md sticky top-0 z-20">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
              <Link to="/" className="flex items-center" onClick={() => setIsMenuOpen(false)}>
                  <LogoIcon className="h-8 w-auto text-white" />
              </Link>
              
              {/* Desktop Menu */}
              <div className='hidden md:flex items-center space-x-4'>
                  <OrganizationSwitcher />
                  <Link to="/" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Início</Link>
                  <Link to="/status" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Status</Link>
                  <Link to="/planos" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Planos</Link>
                  <Link to="/admin" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Admin</Link>
                  {adminData && (
                      <button onClick={handleLogout} className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                          <LogoutIcon className="h-5 w-5" />
                          <span>Sair</span>
                      </button>
                  )}
              </div>

              {/* Mobile Menu Button */}
              <div className="md:hidden flex items-center">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                    aria-controls="mobile-menu"
                    aria-expanded={isMenuOpen}
                  >
                      <span className="sr-only">Abrir menu</span>
                      {isMenuOpen ? (
                          <XIcon className="h-6 w-6" aria-hidden="true" />
                      ) : (
                          <MenuIcon className="h-6 w-6" aria-hidden="true" />
                      )}
                  </button>
              </div>
          </nav>

          {/* Mobile Menu Panel */}
          {isMenuOpen && (
              <div className="md:hidden" id="mobile-menu">
                  <div className="px-2 pt-2 pb-4 space-y-2 sm:px-3">
                      <div className="px-2 pb-3 mb-2 border-b border-gray-700">
                          <OrganizationSwitcher />
                      </div>
                      <Link to="/" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Início</Link>
                      <Link to="/status" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Status</Link>
                      <Link to="/planos" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Planos</Link>
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
  return (
    <AdminAuthProvider>
      <Router>
        <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col">
          <Header />
          <main className="container mx-auto p-4 md:p-8 flex-grow">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<PublicHome />} />
                <Route path="/:organizationId" element={<StateSelection />} />
                <Route path="/:organizationId/register/:state/:campaignName?" element={<RegistrationForm />} />
                
                <Route path="/admin/*" element={<AdminAuth />} />
                <Route path="/status" element={<StatusCheck />} />
                <Route path="/posts" element={<PostCheck />} />
                <Route path="/connect" element={<FollowLoopPage />} />
                <Route path="/proof/:assignmentId" element={<ProofUploadPage />} />
                <Route path="/listas/:campaignId" element={<GuestListCheck />} />
                <Route path="/post-unico/:postId" element={<OneTimePostPage />} />
                <Route path="/planos" element={<PricingPage />} />
                <Route path="/subscribe/:planId" element={<SubscriptionFlowPage />} />
                <Route path="/leave-group" element={<LeaveGroupPage />} />
              </Routes>
            </ErrorBoundary>
          </main>
          <footer className="text-center py-4 text-gray-400 text-sm">
              <p>&copy; {new Date().getFullYear()} Equipe Certa. Todos os direitos reservados.</p>
          </footer>
        </div>
      </Router>
    </AdminAuthProvider>
  );
};

export default App;
