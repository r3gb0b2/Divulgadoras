import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
// FIX: Removed modular signInWithEmailAndPassword import to use compat syntax.
import { auth } from '../firebase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { submitAdminApplication } from '../services/adminService';
import AdminPanel from './AdminPanel';
import SuperAdminDashboard from './SuperAdminDashboard';
import StatesListPage from './StatesListPage';
import StateManagementPage from './StateManagementPage';
import SettingsPage from './SettingsPage';
import ManageUsersPage from './ManageUsersPage';
import SubscriptionPage from './SubscriptionPage';
import StripeSettingsPage from './StripeSettingsPage';
import OrganizationsListPage from './OrganizationsListPage';
import ManageOrganizationPage from './ManageOrganizationPage';
import AdminApplicationsListPage from './AdminApplicationsListPage'; // Import the new page
import { MailIcon, LockClosedIcon, BuildingOfficeIcon, UserIcon, PhoneIcon } from '../components/Icons';
import GeminiPage from './Gemini';
import EmailTemplateEditor from './EmailTemplateEditor';
import AdminPosts from './AdminPosts';
import CreatePost from './CreatePost';
// FIX: Changed to a named import to resolve module export issue.
import { PostDetails } from './PostDetails';
import GuestListPage from './GuestListPage'; // Import new page
import GuestListCheckinPage from './GuestListCheckinPage'; // Import new page
import GuestListAccessPage from './GuestListAccessPage';

const AdminRegistrationRequestForm: React.FC<{ onSwitchToLogin: () => void }> = ({ onSwitchToLogin }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        message: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (formData.password !== formData.confirmPassword) {
            setError("As senhas não coincidem.");
            setIsLoading(false);
            return;
        }

        try {
            const { password, confirmPassword, ...applicationData } = formData;
            await submitAdminApplication(applicationData, password);
            setIsSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-white mb-4">Solicitação Enviada!</h2>
                <p className="text-gray-300 mb-6">Sua solicitação de acesso foi enviada com sucesso. Após a aprovação, você poderá fazer login com o e-mail e senha cadastrados.</p>
                <button onClick={onSwitchToLogin} className="font-medium text-primary hover:text-primary-dark">
                    &larr; Voltar para o Login
                </button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-md">
            <form onSubmit={handleSubmit} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                <h1 className="text-2xl font-bold text-white mb-4">Solicitar Acesso de Admin</h1>
                <p className="text-gray-400 mb-6">Preencha os dados abaixo. Após aprovação, seu acesso será liberado.</p>
                
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                
                <div className="space-y-4 text-left">
                    <InputWithIcon Icon={UserIcon} type="text" name="name" placeholder="Seu nome completo" value={formData.name} onChange={handleChange} required />
                    <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail (será seu login)" value={formData.email} onChange={handleChange} required />
                    <InputWithIcon Icon={PhoneIcon} type="tel" name="phone" placeholder="WhatsApp (com DDD)" value={formData.phone} onChange={handleChange} required />
                    <InputWithIcon Icon={LockClosedIcon} type="password" name="password" placeholder="Crie uma senha de acesso" value={formData.password} onChange={handleChange} required />
                    <InputWithIcon Icon={LockClosedIcon} type="password" name="confirmPassword" placeholder="Confirme sua senha" value={formData.confirmPassword} onChange={handleChange} required />
                    <textarea name="message" value={formData.message} onChange={handleChange} placeholder="Mensagem (opcional)" className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200" rows={2}></textarea>
                </div>
                
                <button type="submit" disabled={isLoading} className="w-full mt-6 py-3 px-4 bg-primary text-white rounded-md hover:bg-primary-dark font-medium disabled:opacity-50">
                    {isLoading ? 'Enviando...' : 'Solicitar Acesso'}
                </button>
                <p className="text-sm text-gray-400 mt-4">
                    Já tem uma conta?{' '}
                    <button type="button" onClick={onSwitchToLogin} className="font-medium text-primary hover:text-primary-dark">
                        Faça login
                    </button>
                </p>
            </form>
        </div>
    );
};

interface InputWithIconProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
    Icon: React.ElementType;
}
const InputWithIcon: React.FC<InputWithIconProps> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200" />
    </div>
);


const AdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            // FIX: Use compat signInWithEmailAndPassword method.
            await auth.signInWithEmailAndPassword(email, password);
            navigate('/admin');
        } catch (error) {
            console.error(error);
            setError("E-mail ou senha inválidos. Sua conta pode estar pendente de aprovação.");
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            {isRegistering ? (
                <AdminRegistrationRequestForm onSwitchToLogin={() => setIsRegistering(false)} />
            ) : (
                <div className="w-full max-w-md">
                    <form onSubmit={handleLogin} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                        <h1 className="text-2xl font-bold text-white mb-4">Login do Organizador</h1>
                        <p className="text-gray-400 mb-6">Acesse seu painel para gerenciar suas divulgadoras.</p>
                        
                        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                        
                        <div className="space-y-4 text-left">
                           <InputWithIcon Icon={MailIcon} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" required />
                           <InputWithIcon Icon={LockClosedIcon} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required />
                        </div>
                        
                        <button type="submit" disabled={isLoading} className="w-full mt-6 py-3 px-4 bg-primary text-white rounded-md hover:bg-primary-dark font-medium disabled:opacity-50">
                            {isLoading ? 'Entrando...' : 'Entrar'}
                        </button>

                        <p className="text-sm text-gray-400 mt-4">
                            Precisa de acesso de administrador?{' '}
                            <button type="button" onClick={() => setIsRegistering(true)} className="font-medium text-primary hover:text-primary-dark">
                                Solicite seu acesso
                            </button>
                        </p>
                        <p className="text-xs text-gray-600 mt-4 text-center">Frontend v19.0</p>
                    </form>
                </div>
            )}
        </div>
    );
};


const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
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
                    {
                        adminData?.role === 'superadmin' ? <SuperAdminDashboard /> :
                        adminData?.role === 'poster' ? <Navigate to="/admin/posts" replace /> :
                        <AdminPanel adminData={adminData!} />
                    }
                </ProtectedRoute>
            } />
            
             {/* Routes for SuperAdmins */}
            {adminData?.role === 'superadmin' && (
                <>
                    <Route path="promoters" element={<ProtectedRoute><AdminPanel adminData={adminData} /></ProtectedRoute>} />
                    <Route path="states" element={<ProtectedRoute><StatesListPage /></ProtectedRoute>} />
                    <Route path="state/:stateAbbr" element={<ProtectedRoute><StateManagementPage adminData={adminData} /></ProtectedRoute>} />
                    <Route path="users" element={<ProtectedRoute><ManageUsersPage /></ProtectedRoute>} />
                    <Route path="organizations" element={<ProtectedRoute><OrganizationsListPage /></ProtectedRoute>} />
                    <Route path="organization/:orgId" element={<ProtectedRoute><ManageOrganizationPage /></ProtectedRoute>} />
                    <Route path="applications" element={<ProtectedRoute><AdminApplicationsListPage /></ProtectedRoute>} />
                    <Route path="settings/stripe" element={<ProtectedRoute><StripeSettingsPage /></ProtectedRoute>} />
                    <Route path="gemini" element={<ProtectedRoute><GeminiPage /></ProtectedRoute>} />
                    <Route path="settings/email" element={<ProtectedRoute><EmailTemplateEditor /></ProtectedRoute>} />
                    <Route path="posts" element={<ProtectedRoute><AdminPosts /></ProtectedRoute>} />
                    <Route path="posts/new" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
                    <Route path="posts/:postId" element={<ProtectedRoute><PostDetails /></ProtectedRoute>} />
                    <Route path="guestlist/:campaignId" element={<ProtectedRoute><GuestListPage /></ProtectedRoute>} />
                    <Route path="checkin/:campaignId" element={<ProtectedRoute><GuestListCheckinPage /></ProtectedRoute>} />
                    <Route path="guestlist-access/:campaignId" element={<ProtectedRoute><GuestListAccessPage /></ProtectedRoute>} />
                </>
            )}

            {/* Routes for regular Admins */}
            {adminData?.role === 'admin' && (
                <>
                    <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="users" element={<ProtectedRoute><ManageUsersPage /></ProtectedRoute>} />
                    <Route path="settings/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
                    <Route path="states" element={<ProtectedRoute><StatesListPage /></ProtectedRoute>} />
                    <Route path="state/:stateAbbr" element={<ProtectedRoute><StateManagementPage adminData={adminData} /></ProtectedRoute>} />
                    <Route path="gemini" element={<ProtectedRoute><GeminiPage /></ProtectedRoute>} />
                    <Route path="posts" element={<ProtectedRoute><AdminPosts /></ProtectedRoute>} />
                    <Route path="posts/new" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
                    <Route path="posts/:postId" element={<ProtectedRoute><PostDetails /></ProtectedRoute>} />
                    <Route path="guestlist/:campaignId" element={<ProtectedRoute><GuestListPage /></ProtectedRoute>} />
                    <Route path="checkin/:campaignId" element={<ProtectedRoute><GuestListCheckinPage /></ProtectedRoute>} />
                    <Route path="guestlist-access/:campaignId" element={<ProtectedRoute><GuestListAccessPage /></ProtectedRoute>} />
                    <Route path="organization/:orgId" element={<ProtectedRoute><ManageOrganizationPage /></ProtectedRoute>} />
                </>
            )}

            {/* Routes for Posters */}
            {adminData?.role === 'poster' && (
                <>
                    <Route path="posts" element={<ProtectedRoute><AdminPosts /></ProtectedRoute>} />
                    <Route path="posts/new" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
                    <Route path="posts/:postId" element={<ProtectedRoute><PostDetails /></ProtectedRoute>} />
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
