
import React from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminPanel from './pages/AdminPanel';

const Header: React.FC = () => {
  const activeLinkClass = 'bg-primary text-white';
  const inactiveLinkClass = 'text-gray-300 hover:bg-secondary hover:text-white';
  const baseLinkClass = 'px-3 py-2 rounded-md text-sm font-medium transition-colors';

  return (
    <header className="bg-dark shadow-lg">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <span className="text-white text-xl font-bold">Divulgadoras VIP</span>
          </div>
          <div className="flex items-baseline space-x-4">
            <NavLink
              to="/"
              className={({ isActive }) => `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}
            >
              Cadastro
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) => `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}
            >
              Admin
            </NavLink>
          </div>
        </div>
      </nav>
    </header>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <Header />
        <main className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<RegistrationForm />} />
              <Route path="/admin" element={<AdminPanel />} />
            </Routes>
          </div>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
