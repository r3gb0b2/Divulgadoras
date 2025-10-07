import React, { useState } from 'react';
import AdminPanel from './AdminPanel';

const ADMIN_PASSWORD = '123654';

const AdminAuth: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isAdminAuthenticated') === 'true');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            sessionStorage.setItem('isAdminAuthenticated', 'true');
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('Senha incorreta.');
            setPassword('');
        }
    };

    if (isAuthenticated) {
        return <AdminPanel />;
    }

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <div className="w-full max-w-md">
                <form onSubmit={handleLogin} className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Acesso Restrito</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">Por favor, insira a senha para acessar o painel administrativo.</p>
                    
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Senha"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                        autoFocus
                    />
                    
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                    
                    <button
                        type="submit"
                        className="w-full mt-6 flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminAuth;