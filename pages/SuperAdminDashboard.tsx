
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { testEmailSystem } from '../services/emailService';
import { 
    UsersIcon, 
    BuildingOfficeIcon, 
    KeyIcon, 
    ShieldCheckIcon, 
    EnvelopeIcon, 
    FaceIdIcon,
    TrashIcon,
    PencilIcon,
    WhatsAppIcon,
    RefreshIcon,
    ClockIcon,
    ClipboardDocumentListIcon
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
            alert("Erro ao chamar a função de teste: " + err.message);
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
                {/* DIAGNÓSTICO WHATSAPP */}
                <div className="lg:col-span-2 bg-green-900/10 border border-green-700/50 rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <WhatsAppIcon className="w-6 h-6 text-green-400" />
                        Z-API: Configuração e Diagnóstico
                    </h2>
                    <p className="text-sm text-gray-400 mb-6">Para o WhatsApp funcionar, as 3 chaves abaixo devem estar configuradas no ambiente do Firebase.</p>
                    
                    <div className="bg-dark/50 p-4 rounded-xl border border-gray-700 mb-6">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Comando para configurar (Terminal):</h3>
                        <pre className="text-[10px] font-mono bg-black p-3 rounded-lg text-green-400 overflow-x-auto whitespace-pre-wrap">
                            firebase functions:config:set zapi.instance="SUA_INSTANCIA" zapi.token="SEU_TOKEN" zapi.client_token="SEU_CLIENT_TOKEN"
                        </pre>
                    </div>

                    <button 
                        onClick={handleTestWhatsApp}
                        disabled={isTestingWa}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-500 disabled:opacity-50 transition-all font-bold shadow-lg shadow-green-900/20"
                    >
                        {isTestingWa ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <WhatsAppIcon className="w-5 h-5" />}
                        {isTestingWa ? "Validando Chaves..." : "Testar WhatsApp Agora"}
                    </button>

                    {waTestResult && (
                        <div className="mt-6 p-5 bg-black/40 rounded-xl border border-gray-700 font-mono text-[11px] animate-fadeIn">
                            <h4 className="text-white font-bold mb-3 border-b border-gray-700 pb-2 flex justify-between">
                                <span>Relatório de Sistema:</span>
                                <span className={waTestResult.result.success ? 'text-green-400' : 'text-red-400'}>
                                    {waTestResult.result.success ? 'CONECTADO' : 'ERRO'}
                                </span>
                            </h4>
                            <p>{waTestResult.result.message}</p>
                        </div>
                    )}
                </div>

                {/* DIAGNÓSTICO BREVO / EMAIL */}
                <div className="bg-blue-900/10 border border-blue-700/50 rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <EnvelopeIcon className="w-6 h-6 text-blue-400" />
                        Brevo: Teste de E-mail
                    </h2>
                    <p className="text-sm text-gray-400 mb-6">Verifique se as notificações de aprovação via Brevo/SMTP estão chegando.</p>
                    
                    <button 
                        onClick={handleTestEmail}
                        disabled={isTestingEmail}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 transition-all font-bold shadow-lg shadow-blue-900/20"
                    >
                        {isTestingEmail ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <EnvelopeIcon className="w-5 h-5" />}
                        {isTestingEmail ? "Enviando..." : "Disparar E-mail de Teste"}
                    </button>

                    {emailTestResult && (
                        <div className="mt-4 p-3 bg-black/30 rounded-xl border border-blue-800 text-[10px] text-blue-300 font-mono">
                            {emailTestResult}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Link to="/admin/organizations" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Organizações</h2>
                    </div>
                </Link>
                <Link to="/admin/applications" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <KeyIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Solicitações</h2>
                    </div>
                </Link>
                <Link to="/admin/newsletter" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <EnvelopeIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Newsletter</h2>
                    </div>
                </Link>
                <Link to="/admin/email-templates" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
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
