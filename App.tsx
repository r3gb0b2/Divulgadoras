import React from 'react';
import { HashRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';
import StateSelection from './pages/StateSelection';
import PricingPage from './pages/PricingPage';
import PublicHome from './pages/PublicHome';
import SubscriptionFlowPage from './pages/AdminRegistrationPage';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import { LogoIcon } from './components/Icons';
import GeminiPage from './pages/Gemini';
import PostCheck from './pages/PostCheck';
import GuestListCheck from './pages/GuestListCheck'; // Import new page

const App: React.FC = () => {
  return (
    <AdminAuthProvider>
      <Router>
        <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col">
          <header className="bg-secondary shadow-md sticky top-0 z-10">
            <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
              <Link to="/" className="flex items-center">
                <LogoIcon className="h-8 w-auto text-white" />
              </Link>
              <div className='space-x-4'>
                <Link to="/" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Início</Link>
                <Link to="/status" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Verificar Status</Link>
                <Link to="/planos" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Planos</Link>
                <Link to="/admin" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Login Organizador</Link>
              </div>
            </nav>
          </header>
          <main className="container mx-auto p-4 md:p-8 flex-grow">
            <Routes>
              <Route path="/" element={<PublicHome />} />
              <Route path="/:organizationId" element={<StateSelection />} />
              <Route path="/:organizationId/register/:state/:campaignName?" element={<RegistrationForm />} />
              
              <Route path="/admin/*" element={<AdminAuth />} />
              <Route path="/status" element={<StatusCheck />} />
              <Route path="/posts" element={<PostCheck />} />
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