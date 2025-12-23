
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { testEmailSystem } from '../services/emailService';
import { 
    UsersIcon, 
    BuildingOfficeIcon, 
    KeyIcon, 
    EnvelopeIcon, 
    PencilIcon,
    WhatsAppIcon,
    RefreshIcon
} from '../components/Icons';

const SuperAdminDashboard: React.FC = () => {
    const [isTestingWa, setIsTestingWa] = useState(false);
    const [waTestResult, setWaTestResult] = useState<any>(null);
    
    const [isTestingEmail, setIsTestingEmail] = useState(false);
    const [emailTestResult, setEmailTestResult] = useState<string | null>(null);

    const handleTestWhatsApp = async () => {
        setIsTestingWa(true);
        setWaTestResult(null);
        try {
            const testIntegration = httpsCallable(functions, 'testWhatsAppIntegration');
            const result = await testIntegration();
            setWaTestResult(result.data);
        } catch (err: any) {
            alert("Erro na chamada da função: " + err.message);
        } finally {
            setIsTestingWa(false);
        }
    };

    const handleTestEmail = async () => {
        setIsTestingEmail(true);
        setEmailTestResult(null);
        try {
            const res = await testEmailSystem();
            setEmailTestResult(res.message);
        } catch (err: any) {
            setEmailTestResult("ERRO: " + err.message);
        } finally {
            setIsTestingEmail(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Painel Super Admin</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* WHATSAPP DIAGNOSTIC */}
                <div className="lg:col-span-2 bg-green-900/10 border border-green-700/50 rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <WhatsAppIcon className="w-6 h-6 text-green-400" />
                        WhatsApp (Z-API)
                    </h2>
                    <p className="text-sm text-gray-400 mb-6">Valide se as mensagens automáticas estão sendo enviadas corretamente.</p>
                    
                    <button 
                        onClick={handleTestWhatsApp}
                        disabled={isTestingWa}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-500 disabled:opacity-50 transition-all font-bold"
                    >
                        {isTestingWa ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <WhatsAppIcon className="w-5 h-5" />}
                        {isTestingWa ? "Validando..." : "Testar WhatsApp"}
                    </button>

                    {waTestResult && (
                        <div className="mt-4 p-4 bg-black/40 rounded-xl border border-gray-700 font-mono text-[11px]">
                            <p className={waTestResult.result.success ? 'text-green-400' : 'text-red-400'}>
                                {waTestResult.result.message}
                            </p>
                        </div>
                    )}
                </div>

                {/* EMAIL DIAGNOSTIC */}
                <div className="bg-blue-900/10 border border-blue-700/50 rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <EnvelopeIcon className="w-6 h-6 text-blue-400" />
                        E-mail (Brevo)
                    </h2>
                    <p className="text-sm text-gray-400 mb-6">Teste o disparo de e-mails transacionais.</p>
                    
                    <button 
                        onClick={handleTestEmail}
                        disabled={isTestingEmail}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 font-bold"
                    >
                        {isTestingEmail ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <EnvelopeIcon className="w-5 h-5" />}
                        {isTestingEmail ? "Enviando..." : "Disparar Teste"}
                    </button>

                    {emailTestResult && (
                        <div className="mt-4 p-3 bg-black/30 rounded-xl border border-blue-800 text-[10px] text-blue-300 font-mono">
                            {emailTestResult}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Link to="/admin/organizations" className="p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all">
                    <div className="flex items-center">
                        <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Organizações</h2>
                    </div>
                </Link>
                <Link to="/admin/applications" className="p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all">
                    <div className="flex items-center">
                        <KeyIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Solicitações</h2>
                    </div>
                </Link>
                <Link to="/admin/newsletter" className="p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all">
                    <div className="flex items-center">
                        <EnvelopeIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Newsletter</h2>
                    </div>
                </Link>
                <Link to="/admin/email-templates" className="p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all">
                    <div className="flex items-center">
                        <PencilIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Templates</h2>
                    </div>
                </Link>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
