import React, { useState } from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import AdminPanel from './AdminPanel';
import { MailIcon } from '../components/Icons';
import { AdminAuthProvider, useAdminAuth } from '../contexts/AdminAuthContext';
import StatesListPage from './StatesListPage';
import StateManagementPage from './StateManagementPage';
import ManageUsersPage from './ManageUsersPage';
import SettingsPage from './SettingsPage';
import SubscriptionPage from './SubscriptionPage';
import SuperAdminDashboard from './SuperAdminDashboard';

const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // The context will handle the rest
        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-email') {
                setError('E-mail ou senha inválidos.');
            } else {
                setError('Ocorreu um erro ao tentar fazer login.');
            }
        } finally {
            setIsLoading(false);
            setPassword('');
        }
    };

    return (
        <div className="flex items-center justify-center flex-grow">
            <div className="w-full max-w-md">
                <form onSubmit={handleLogin} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Acesso Restrito</h1>
                    <p className="text-gray-400 mb-6">Por favor, insira suas credenciais para acessar o painel administrativo.</p>
                    
                    <div className="space-y-4">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <MailIcon className="h-5 w-5 text-gray-400" />
                            </span>
                             <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="E-mail"
                                className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                                required
                                autoFocus
                            />
                        </div>
                       <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Senha"
                            className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                            required
                        />
                    </div>
                    
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                    
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-6 flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                    <p className="text-sm text-gray-400 mt-4">
                        Não tem uma conta?{' '}
                        <Link to="/planos" className="font-medium text-primary hover:text-primary-dark">
                            Crie uma conta
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};


const AdminPageContent: React.FC = () => {
    const { adminData, loading } = useAdminAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center flex-grow">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    if (adminData) {
        if (adminData.role === 'superadmin') {
            return (
                <Routes>
                    <Route index element={<SuperAdminDashboard />} />
                    <Route path="promoters" element={<AdminPanel adminData={adminData} />} />
                    <Route path="states" element={<StatesListPage />} />
                    <Route path="state/:stateAbbr" element={<StateManagementPage adminData={adminData} />} />
                    <Route path="users" element={<ManageUsersPage />} />
                </Routes>
            );
        }

        // Routes for 'admin' and 'viewer'
        return (
            <Routes>
                <Route index element={<AdminPanel adminData={adminData} />} />
                {(adminData.role === 'admin') && (
                    <>
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="settings/subscription" element={<SubscriptionPage />} />
                        <Route path="users" element={<ManageUsersPage />} />
                    </>
                )}
            </Routes>
        );
    }

    return <LoginForm />;
}


const AdminAuth: React.FC = () => {
    return (
        <AdminAuthProvider>
            <AdminPageContent />
        </AdminAuthProvider>
    );
};

export default AdminAuth;