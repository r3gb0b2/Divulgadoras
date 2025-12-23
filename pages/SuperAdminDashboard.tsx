
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    UsersIcon, 
    BuildingOfficeIcon, 
    KeyIcon, 
    EnvelopeIcon, 
    PencilIcon,
    WhatsAppIcon,
    RefreshIcon,
    AlertTriangleIcon
} from '../components/Icons';

const SuperAdminDashboard: React.FC = () => {
    const [isTestingWa, setIsTestingWa] = useState(false);
    const [waResult, setWaResult] = useState<any>(null);
    
    const [isTestingEmail, setIsTestingEmail] = useState(false);
    const [emailResult, setEmailResult] = useState<any>(null);

    const handleTestWhatsApp = async () => {
        setIsTestingWa(true);
        setWaResult(null);
        try {
            const func = httpsCallable(functions, 'testWhatsAppIntegration');
            const res: any = await func();
            setWaResult(res.data);
        } catch (err: any) {
            setWaResult({ success: false, message: err.message });
        } finally {
            setIsTestingWa(false);
        }
    };

    const handleTestEmail = async () => {
        setIsTestingEmail(true);
        setEmailResult(null);
        try {
            const func = httpsCallable(functions, 'sendTestEmail');
            const res: any = await func();
            setEmailResult(res.data);
        } catch (err: any) {
            setEmailResult({ success: false, message: err.message });
        } finally {
            setIsTestingEmail(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Painel Super Admin</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* WHATSAPP CARD */}
                <div className="bg-green-900/10 border border-green-700/50 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <WhatsAppIcon className="w-6 h-6 text-green-400" /> WhatsApp (Z-API)
                        </h2>
                        <button 
                            onClick={handleTestWhatsApp}
                            disabled={isTestingWa}
                            className="bg-green-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-500 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isTestingWa ? <RefreshIcon className="w-4 h-4 animate-spin" /> : "Testar Agora"}
                        </button>
                    </div>

                    {waResult && (
                        <div className={`mt-2 p-4 rounded-xl text-sm border ${waResult.success ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-red-900/20 border-red-800 text-red-300'}`}>
                            <p className="font-bold">{waResult.message}</p>
                            <div className="mt-3 p-2 bg-black/40 rounded font-mono text-[10px] overflow-auto max-h-40">
                                <p className="text-gray-500 mb-1">// Resposta Bruta da API:</p>
                                {JSON.stringify(waResult.debug, null, 2)}
                            </div>
                        </div>
                    )}
                </div>

                {/* EMAIL CARD */}
                <div className="bg-blue-900/10 border border-blue-700/50 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <EnvelopeIcon className="w-6 h-6 text-blue-400" /> E-mail (Brevo)
                        </h2>
                        <button 
                            onClick={handleTestEmail}
                            disabled={isTestingEmail}
                            className="bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isTestingEmail ? <RefreshIcon className="w-4 h-4 animate-spin" /> : "Testar Agora"}
                        </button>
                    </div>

                    {emailResult && (
                        <div className={`mt-2 p-4 rounded-xl text-sm border ${emailResult.success ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-red-900/20 border-red-800 text-red-300'}`}>
                            <p className="font-bold">{emailResult.message}</p>
                            {!emailResult.success && (
                                <div className="mt-3 bg-yellow-900/20 p-2 rounded text-[10px] text-yellow-200">
                                    <p>💡 <strong>Dica:</strong> Verifique se o e-mail remetente está na lista de "Senders & IP" no painel da Brevo.</p>
                                </div>
                            )}
                            <div className="mt-3 p-2 bg-black/40 rounded font-mono text-[10px] overflow-auto max-h-40">
                                <p className="text-gray-500 mb-1">// Logs do Servidor:</p>
                                {JSON.stringify(emailResult.debug, null, 2)}
                            </div>
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
