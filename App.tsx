
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RegistrationForm from './pages/RegistrationForm';
import AdminAuth from './pages/AdminAuth';
import StatusCheck from './pages/StatusCheck';

const App: React.FC = () => {
  return (
    <Router>
      <div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen font-sans flex flex-col">
        <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-10">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold text-primary">DivulgaAqui</Link>
            <div className='space-x-4'>
              <Link to="/" className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary-light px-3 py-2 rounded-md text-sm font-medium">Cadastro</Link>
              <Link to="/status" className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary-light px-3 py-2 rounded-md text-sm font-medium">Verificar Status</Link>
              <Link to="/admin" className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary-light px-3 py-2 rounded-md text-sm font-medium">Admin</Link>
            </div>
          </nav>
        </header>
        <main className="container mx-auto p-4 md:p-8 flex-grow">
          <Routes>
            <Route path="/" element={<RegistrationForm />} />
            <Route path="/admin" element={<AdminAuth />} />
            <Route path="/status" element={<StatusCheck />} />
          </Routes>
        </main>
        <footer className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            <p>&copy; {new Date().getFullYear()} DivulgaAqui. Todos os direitos reservados.</p>
        </footer>
      </div>
    </Router>
  );
};

export default App;
