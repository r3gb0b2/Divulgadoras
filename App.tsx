import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';
import StateSelection from './pages/StateSelection';
import PricingPage from './pages/PricingPage';
import PublicHome from './pages/PublicHome';
import SubscriptionFlowPage from './pages/AdminRegistrationPage';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { LogoIcon, MenuIcon, XIcon } from './components/Icons';
import GeminiPage from './pages/Gemini';
import PostCheck from './pages/PostCheck';
import GuestListCheck from './pages/GuestListCheck'; // Import new page
import ProofUploadPage from './pages/ProofUploadPage';

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


const App: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <AdminAuthProvider>
      <Router>
        <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col">
          <header className="bg-secondary shadow-md sticky top-0 z-20">
            <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
              <Link to="/" className="flex items-center" onClick={() => setIsMenuOpen(false)}>
                <LogoIcon className="h-8 w-auto text-white" />
              </Link>
              
              {/* Desktop Menu */}
              <div className='hidden md:flex items-center space-x-4'>
                <OrganizationSwitcher />
                <Link to="/" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Início</Link>
                <Link to="/status" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Verificar Status</Link>
                <Link to="/planos" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Planos</Link>
                <Link to="/admin" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Login Organizador</Link>
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
                  <Link to="/status" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Verificar Status</Link>
                  <Link to="/planos" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Planos</Link>
                  <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block text-gray-300 hover:text-primary px-3 py-2 rounded-md text-base font-medium">Login Organizador</Link>
                </div>
              </div>
            )}
          </header>
          <main className="container mx-auto p-4 md:p-8 flex-grow">
            <Routes>
              <Route path="/" element={<PublicHome />} />
              <Route path="/:organizationId" element={<StateSelection />} />
              <Route path="/:organizationId/register/:state/:campaignName?" element={<RegistrationForm />} />
              
              <Route path="/admin/*" element={<AdminAuth />} />
              <Route path="/status" element={<StatusCheck />} />
              <Route path="/posts" element={<PostCheck />} />
              <Route path="/proof/:assignmentId" element={<ProofUploadPage />} />
              <Route path="/lista/:organizationId?/:campaignId?" element={<GuestListCheck />} />
              <Route path="/planos" element={<PricingPage />} />
              <Route path="/subscribe/:planId" element={<SubscriptionFlowPage />} />
            </Routes>
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