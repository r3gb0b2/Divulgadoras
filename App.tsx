import React from 'react';
import { HashRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';
import StateSelection from './pages/StateSelection';
import AdminRegistrationPage from './pages/AdminRegistrationPage';
import PricingPage from './pages/PricingPage';

const App: React.FC = () => {
  return (
    <Router>
      <div className="bg-dark text-gray-200 min-h-screen font-sans flex flex-col">
        <header className="bg-secondary shadow-md sticky top-0 z-10">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold text-primary">DIVULGAÇÕES D&E MUSIC</Link>
            <div className='space-x-4'>
              <Link to="/" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Início</Link>
              <Link to="/status" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Verificar Status</Link>
              <Link to="/planos" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Planos</Link>
              <Link to="/admin" className="text-gray-300 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Admin</Link>
            </div>
          </nav>
        </header>
        <main className="container mx-auto p-4 md:p-8 flex-grow">
          <Routes>
            <Route path="/" element={<StateSelection />} />
            <Route path="/register/:state/:campaignName?" element={<RegistrationForm />} />
            <Route path="/admin/*" element={<AdminAuth />} />
            <Route path="/admin-register" element={<AdminRegistrationPage />} />
            <Route path="/status" element={<StatusCheck />} />
            <Route path="/planos" element={<PricingPage />} />
          </Routes>
        </main>
        <footer className="text-center py-4 text-gray-400 text-sm">
            <p>&copy; {new Date().getFullYear()} DIVULGAÇÕES D&E MUSIC. Todos os direitos reservados.</p>
        </footer>
      </div>
    </Router>
  );
};

export default App;