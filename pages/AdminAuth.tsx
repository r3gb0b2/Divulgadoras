
import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { submitAdminApplication } from '../services/adminService';
import { AdminPanel } from './AdminPanel';
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
import { PostDetails } from './PostDetails';
import GuestListPage from './GuestListPage'; // Import new page
import GuestListCheckinPage from './GuestListCheckinPage'; // Import new page
import AdminLists from './AdminLists';
import GuestListAssignments from './GuestListAssignments';
import ChangePasswordPage from './ChangePasswordPage'; // Import new page
import PostDashboard from './PostDashboard';
import AdminSchedulePage from './AdminSchedulePage';
import PromoterDiagnosticsPage from './PromoterDiagnosticsPage'; // Import new page
import AdminCheckinDashboard from './AdminCheckinDashboard'; // Import new page
import QrCodeScannerPage from './QrCodeScannerPage'; // Importar a nova página
import AdminOneTimePosts from './AdminOneTimePosts';
import CreateOneTimePost from './CreateOneTimePost';
import EditOneTimePost from './EditOneTimePost';
import OneTimePostDetails from './OneTimePostDetails';

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
            await auth.signInWithEmailAndPassword(email, password);
            // The redirection will be handled by the AdminAuth component after state update
            navigate('/admin');
        } catch (error: any) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                setError('E-mail ou senha inválidos.');
            } else {
                setError(error.message || 'Falha no login.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-dark p-4">
            {isRegistering ? (
                <AdminRegistrationRequestForm onSwitchToLogin={() => setIsRegistering(false)} />
            ) : (
                <div className="w-full max-w-sm">
                    <form onSubmit={handleLogin} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                        <h1 className="text-2xl font-bold text-white mb-6">Login de Admin</h1>
                        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                        <div className="space-y-4">
                            <InputWithIcon Icon={MailIcon} type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            <InputWithIcon Icon={LockClosedIcon} type="password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full mt-6 py-3 px-4 bg-primary text-white rounded-md hover:bg-primary-dark font-medium disabled:opacity-50">
                            {isLoading ? 'Entrando...' : 'Entrar'}
                        </button>
                        <p className="text-sm text-gray-400 mt-4">
                            Não tem uma conta?{' '}
                            <button type="button" onClick={() => setIsRegistering(true)} className="font-medium text-primary hover:text-primary-dark">
                                Solicite seu acesso
                            </button>
                        </p>
                    </form>
                </div>
            )}
        </div>
    );
};

const AdminAuth: React.FC = () => {
    const { user, adminData, loading } = useAdminAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!user || !adminData) {
        return <AdminLogin />;
    }

    if (location.pathname === '/admin' || location.pathname === '/admin/login') {
        const dashboardPath = adminData.role === 'superadmin' ? '/admin/dashboard' : '/admin/promoters';
        return <Navigate to={dashboardPath} replace />;
    }

    return (
        <Routes>
            <Route path="/promoters" element={<AdminPanel adminData={adminData} />} />
            <Route path="/dashboard" element={adminData.role === 'superadmin' ? <SuperAdminDashboard /> : <PostDashboard />} />
            <Route path="/states" element={<StatesListPage />} />
            <Route path="/state/:stateAbbr" element={<StateManagementPage adminData={adminData} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users" element={<ManageUsersPage />} />
            <Route path="/settings/subscription" element={<SubscriptionPage />} />
            <Route path="/settings/stripe" element={<StripeSettingsPage />} />
            <Route path="/organizations" element={<OrganizationsListPage />} />
            <Route path="/organization/:orgId" element={<ManageOrganizationPage />} />
            <Route path="/applications" element={<AdminApplicationsListPage />} />
            <Route path="/gemini" element={<GeminiPage />} />
            <Route path="/settings/email" element={<EmailTemplateEditor />} />
            <Route path="/posts" element={<AdminPosts />} />
            <Route path="/posts/new" element={<CreatePost />} />
            <Route path="/posts/:postId" element={<PostDetails />} />
            <Route path="/lists" element={<AdminLists />} />
            <Route path="/guestlist/:campaignId" element={<GuestListPage />} />
            <Route path="/checkin/:campaignId" element={<GuestListCheckinPage />} />
            <Route path="/guestlist-assignments/:listId" element={<GuestListAssignments />} />
            <Route path="/settings/change-password" element={<ChangePasswordPage />} />
            <Route path="/scheduled-posts" element={<AdminSchedulePage />} />
            <Route path="/diagnostics" element={<PromoterDiagnosticsPage />} />
            <Route path="/checkin-dashboard" element={<AdminCheckinDashboard />} />
            <Route path="/checkin/scanner" element={<QrCodeScannerPage />} />
            <Route path="/one-time-posts" element={<AdminOneTimePosts />} />
            <Route path="/one-time-posts/new" element={<CreateOneTimePost />} />
            <Route path="/one-time-posts/edit/:postId" element={<EditOneTimePost />} />
            <Route path="/one-time-posts/:postId" element={<OneTimePostDetails />} />
        </Routes>
    );
};

export default AdminAuth;
