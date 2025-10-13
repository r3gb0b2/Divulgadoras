import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AdminPanel from './AdminPanel';
import SuperAdminDashboard from './SuperAdminDashboard';
import StatesListPage from './StatesListPage';
import StateManagementPage from './StateManagementPage';
import SettingsPage from './SettingsPage';
import ManageUsersPage from './ManageUsersPage';
import SubscriptionPage from './SubscriptionPage';
import MercadoPagoSettingsPage from './MercadoPagoSettingsPage';
import OrganizationsListPage from './OrganizationsListPage';
import ManageOrganizationPage from './ManageOrganizationPage';
import { MailIcon, LockClosedIcon } from '../components/Icons';

const AdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/admin');
        } catch (error) {
            console.error(error);
            setError("E-mail ou senha inválidos.");
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-md">
                <form onSubmit={handleLogin} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Login do Organizador</h1>
                    <p className="text-gray-400 mb-6">Acesse seu painel para gerenciar suas divulgadoras.</p>
                    
                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                    
                    <div className="space-y-4 text-left">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <MailIcon className="h-5 w-5 text-gray-400" />
                            </span>
                             <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Seu e-mail"
                                className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200"
                                required
                            />
                        </div>
                       <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Sua senha"
                                className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200"
                                required
                            />
                        </div>
                    </div>
                    
                    <button type="submit" disabled={isLoading} className="w-full mt-6 py-3 px-4 bg-primary text-white rounded-md hover:bg-primary-dark font-medium disabled:opacity-50">
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>

                    <p className="text-sm text-gray-400 mt-4">
                        Quer cadastrar sua produtora?{' '}
                        <Link to="/planos" className="font-medium text-primary hover:text-primary-dark">
                            Veja nossos planos
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};


const ProtectedRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
    const { user, loading, adminData } = useAdminAuth();

    if (loading) {
        return <div className="text-center py-10">Verificando autenticação...</div>;
    }
    
    if (!user || !adminData) {
        return <Navigate to="/admin/login" replace />;
    }

    return children;
};


const AdminAuth: React.FC = () => {
    const { adminData } = useAdminAuth();

    return (
        <Routes>
            <Route path="login" element={<AdminLogin />} />

            <Route path="/" element={
                <ProtectedRoute>
                    {adminData?.role === 'superadmin' ? <SuperAdminDashboard /> : <AdminPanel adminData={adminData!} />}
                </ProtectedRoute>
            } />
            
             {/* Routes for SuperAdmins */}
            {adminData?.role === 'superadmin' && (
                <>
                    <Route path="states" element={<ProtectedRoute><StatesListPage /></ProtectedRoute>} />
                    <Route path="state/:stateAbbr" element={<ProtectedRoute><StateManagementPage adminData={adminData} /></ProtectedRoute>} />
                    <Route path="users" element={<ProtectedRoute><ManageUsersPage /></ProtectedRoute>} />
                    <Route path="organizations" element={<ProtectedRoute><OrganizationsListPage /></ProtectedRoute>} />
                    <Route path="organization/:orgId" element={<ProtectedRoute><ManageOrganizationPage /></ProtectedRoute>} />
                    <Route path="settings/mercado-pago" element={<ProtectedRoute><MercadoPagoSettingsPage /></ProtectedRoute>} />
                </>
            )}

            {/* Routes for regular Admins */}
            {adminData?.role === 'admin' && (
                <>
                    <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="users" element={<ProtectedRoute><ManageUsersPage /></ProtectedRoute>} />
                    <Route path="settings/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
                </>
            )}
            
            {/* Catch-all for any other /admin routes, redirect to the appropriate dashboard */}
            <Route path="*" element={
                <ProtectedRoute>
                    <Navigate to="/admin" replace />
                </ProtectedRoute>
            } />
        </Routes>
    );
};

export default AdminAuth;
