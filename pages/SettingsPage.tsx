import React from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, CogIcon, MapPinIcon, KeyIcon, CreditCardIcon, EnvelopeIcon, ClockIcon } from '../components/Icons';
import ChangePasswordPage from './ChangePasswordPage';
import SubscriptionPage from './SubscriptionPage';
import StripeSettingsPage from './StripeSettingsPage';
import EmailTemplateEditor from './EmailTemplateEditor';
import StatesListPage from './StatesListPage';

const SettingsDashboard: React.FC = () => {
    const { adminData } = useAdminAuth();
    const navigate = useNavigate();
    const isSuperAdmin = adminData?.role === 'superadmin';

    const settings = [
        { name: "Alterar Senha", path: "password", icon: KeyIcon, for: 'all' },
        { name: "Assinatura", path: "subscription", icon: CreditCardIcon, for: 'admin' },
        { name: "Localidades", path: "/admin/states", icon: MapPinIcon, for: 'admin'},
        { name: "Publicações Agendadas", path: "/admin/schedule", icon: ClockIcon, for: 'admin' },
        // Super admin only
        { name: "Pagamentos (Stripe)", path: "stripe", icon: CreditCardIcon, for: 'superadmin' },
        { name: "Template de E-mail", path: "email", icon: EnvelopeIcon, for: 'superadmin' },
    ];

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <CogIcon className="w-8 h-8" />
                    Configurações
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {settings.map(setting => {
                        const show = setting.for === 'all' || (setting.for === 'superadmin' && isSuperAdmin) || (setting.for === 'admin' && !isSuperAdmin);
                        if (!show) return null;
                        return (
                            <Link key={setting.path} to={setting.path.startsWith('/') ? setting.path : `/admin/settings/${setting.path}`} className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                                <div className="flex items-center">
                                    <setting.icon className="w-8 h-8 text-primary" />
                                    <h2 className="ml-4 text-xl font-semibold text-gray-100">{setting.name}</h2>
                                </div>
                                <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};


const SettingsPage: React.FC = () => {
    return (
        <Routes>
            <Route index element={<SettingsDashboard />} />
            <Route path="password" element={<ChangePasswordPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="stripe" element={<StripeSettingsPage />} />
            <Route path="email" element={<EmailTemplateEditor />} />
        </Routes>
    );
};

export default SettingsPage;