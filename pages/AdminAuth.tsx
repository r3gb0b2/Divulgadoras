import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AdminPanel from './AdminPanel';
import SuperAdminDashboard from './SuperAdminDashboard';
import StatesListPage from './StatesListPage';
import StateManagementPage from './StateManagementPage';
import ManageUsersPage from './ManageUsersPage';
import OrganizationsListPage from './OrganizationsListPage';
import ManageOrganizationPage from './ManageOrganizationPage';
import AdminApplicationsListPage from './AdminApplicationsListPage';
import SettingsPage from './SettingsPage';
import AdminPosts from './AdminPosts';
import CreatePost from './CreatePost';
import { PostDetails } from './PostDetails';
import PostDashboard from './PostDashboard';
import GuestListPage from './GuestListPage';
import GuestListCheckinPage from './GuestListCheckinPage';
import GuestListAccessPage from './GuestListAccessPage';
import { auth } from '../firebase/config';
import GeminiPage from './Gemini';

const AdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Redirect will be handled by AdminAuth component's useEffect
        } catch (err: any) {
            setError('E-mail ou senha inválidos.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-full py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
                        Acesso do Organizador
                    </h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input id="email-address" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-gray-700 text-gray-200" placeholder="E-mail" />
                        </div>
                        <div>
                            <input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-gray-700 text-gray-200" placeholder="Senha" />
                        </div>
                    </div>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <div>
                        <button type="submit" disabled={isLoading} className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50">
                            {isLoading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ProtectedRoute: React.FC<{ children: React.ReactElement; requiredRole?: 'superadmin' | 'admin' | 'poster' | 'viewer' }> = ({ children, requiredRole }) => {
    const { user, adminData, loading } = useAdminAuth();
    const location = useLocation();

    if (loading) {
        return <div className="text-center p-8">Carregando...</div>;
    }

    if (!user || !adminData) {
        return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    if (requiredRole) {
        const rolesHierarchy = {
            'superadmin': 4,
            'admin': 3,
            'poster': 2,
            'viewer': 1
        };
        const userLevel = rolesHierarchy[adminData.role] || 0;
        const requiredLevel = rolesHierarchy[requiredRole] || 0;

        if (userLevel < requiredLevel) {
            return <Navigate to="/admin" replace />;
        }
    }
    
    return React.cloneElement(children, { adminData });
};


const AdminAuth: React.FC = () => {
    const { adminData, loading } = useAdminAuth();

    if (loading) {
        return <div className="text-center p-8">Verificando autenticação...</div>;
    }

    return (
        <Routes>
            <Route path="login" element={<AdminLogin />} />
            <Route path="/" element={
                <ProtectedRoute>
                    {adminData?.role === 'superadmin' ? <SuperAdminDashboard /> : <AdminPanel adminData={adminData!} />}
                </ProtectedRoute>
            } />
            
            <Route path="settings/*" element={<ProtectedRoute requiredRole="admin"><SettingsPage /></ProtectedRoute>} />
            <Route path="states" element={<ProtectedRoute requiredRole="admin"><StatesListPage /></ProtectedRoute>} />
            <Route path="state/:stateAbbr" element={<ProtectedRoute requiredRole="admin"><StateManagementPage adminData={adminData!} /></ProtectedRoute>} />
            <Route path="promoters" element={<ProtectedRoute requiredRole="viewer"><AdminPanel adminData={adminData!} /></ProtectedRoute>} />
            
             <Route path="posts" element={<ProtectedRoute requiredRole="poster"><AdminPosts /></ProtectedRoute>} />
             <Route path="posts/new" element={<ProtectedRoute requiredRole="poster"><CreatePost /></ProtectedRoute>} />
             <Route path="posts/:postId" element={<ProtectedRoute requiredRole="poster"><PostDetails /></ProtectedRoute>} />
             <Route path="dashboard" element={<ProtectedRoute requiredRole="admin"><PostDashboard /></ProtectedRoute>} />

            <Route path="guestlist/:campaignId" element={<ProtectedRoute requiredRole="admin"><GuestListPage /></ProtectedRoute>} />
            <Route path="guestlist-access/:campaignId" element={<ProtectedRoute requiredRole="admin"><GuestListAccessPage /></ProtectedRoute>} />
            <Route path="checkin/:campaignId" element={<ProtectedRoute requiredRole="admin"><GuestListCheckinPage /></ProtectedRoute>} />
            
            <Route path="gemini" element={<ProtectedRoute requiredRole="admin"><GeminiPage /></ProtectedRoute>} />

            <Route path="organizations" element={<ProtectedRoute requiredRole="superadmin"><OrganizationsListPage /></ProtectedRoute>} />
            <Route path="organization/:orgId" element={<ProtectedRoute requiredRole="superadmin"><ManageOrganizationPage /></ProtectedRoute>} />
            <Route path="applications" element={<ProtectedRoute requiredRole="superadmin"><AdminApplicationsListPage /></ProtectedRoute>} />
            <Route path="users" element={<ProtectedRoute requiredRole="superadmin"><ManageUsersPage /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
    );
};

export default AdminAuth;