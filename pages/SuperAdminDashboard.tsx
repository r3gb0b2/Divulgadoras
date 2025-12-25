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
    AlertTriangleIcon,
    ClockIcon,
    TrashIcon,
    DownloadIcon,
    CogIcon
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

    const downloadConfigFile = (filename: string, content: string) => {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadRC = () => {
        const content = JSON.stringify({
            "projects": {
                "default": "stingressos-e0a5f"
            }
        }, null, 2);
        downloadConfigFile('.firebaserc', content);
    };

    const handleDownloadJSON = () => {
        const content = JSON.stringify({
            "functions": {
                "source": "functions",
                "predeploy": "npm --prefix \"$RESOURCE_DIR\" install"
            },
            "hosting": {
                "public": ".",
                "ignore": [
                    "firebase.json",
                    "**/.*",
                    "**/node_modules/**"
                ],
                "rewrites": [
                    {
                        "source": "**",
                        "destination": "/index.html"
                    }
                ]
            }
        }, null, 2);
        downloadConfigFile('firebase.json', content);
    };

    return (
        <div className="space-y-6 pb-20">
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Super Administração</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* WHATSAPP CARD */}
                <div className="bg-green-900/10 border border-green-700/30 rounded-[2rem] p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2 uppercase tracking-tight">
                            <WhatsAppIcon className="w-6 h-6 text-green-400" /> WhatsApp (Z-API)
                        </h2>
                        <button 
                            onClick={handleTestWhatsApp}
                            disabled={isTestingWa}
                            className="bg-green-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-500 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isTestingWa ? <RefreshIcon className="w-3 h-3 animate-spin" /> : "Testar Conexão"}
                        </button>
                    </div>

                    {waResult && (
                        <div className={`mt-2 p-4 rounded-xl text-xs border ${waResult.success ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-red-900/20 border-red-800 text-red-300'}`}>
                            <p className="font-bold">{waResult.message}</p>
                        </div>
                    )}
                </div>

                {/* EMAIL CARD */}
                <div className="bg-blue-900/10 border border-blue-700/30 rounded-[2rem] p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2 uppercase tracking-tight">
                            <EnvelopeIcon className="w-6 h-6 text-blue-400" /> E-mail (Brevo)
                        </h2>
                        <button 
                            onClick={handleTestEmail}
                            disabled={isTestingEmail}
                            className="bg-blue-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isTestingEmail ? <RefreshIcon className="w-3 h-3 animate-spin" /> : "Testar Envio"}
                        </button>
                    </div>

                    {emailResult && (
                        <div className={`mt-2 p-4 rounded-xl text-xs border ${emailResult.success ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-red-900/20 border-red-800 text-red-300'}`}>
                            <p className="font-bold">{emailResult.message}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* CONFIG FILES CARD */}
            <div className="bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] p-6">
                <h2 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                    <CogIcon className="w-6 h-6 text-gray-400" /> Arquivos de Deploy (CLI)
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                        onClick={handleDownloadRC}
                        className="flex items-center justify-between p-4 bg-dark/40 rounded-2xl border border-white/5 hover:bg-white/5 transition-all group"
                    >
                        <div className="text-left">
                            <p className="text-white font-bold text-sm">.firebaserc</p>
                            <p className="text-gray-500 text-[10px] uppercase">ID do Projeto e Aliases</p>
                        </div>
                        <DownloadIcon className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
                    </button>
                    <button 
                        onClick={handleDownloadJSON}
                        className="flex items-center justify-between p-4 bg-dark/40 rounded-2xl border border-white/5 hover:bg-white/5 transition-all group"
                    >
                        <div className="text-left">
                            <p className="text-white font-bold text-sm">firebase.json</p>
                            <p className="text-gray-500 text-[10px] uppercase">Configuração de Hosting/Functions</p>
                        </div>
                        <DownloadIcon className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link to="/admin/organizations" className="group p-6 bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] hover:bg-primary transition-all">
                    <div className="flex items-center">
                        <div className="p-3 rounded-2xl bg-primary/20 text-primary group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <BuildingOfficeIcon className="w-8 h-8" />
                        </div>
                        <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Organizações</h2>
                    </div>
                    <p className="mt-4 text-gray-400 text-sm group-hover:text-purple-100">Gerencie produtoras, planos e assinaturas ativas.</p>
                </Link>

                <Link to="/admin/newsletter" className="group p-6 bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] hover:bg-blue-600 transition-all">
                    <div className="flex items-center">
                        <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <EnvelopeIcon className="w-8 h-8" />
                        </div>
                        <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Newsletter</h2>
                    </div>
                    <p className="mt-4 text-gray-400 text-sm group-hover:text-blue-100">Envio de e-mail em massa para a base global.</p>
                </Link>

                <Link to="/admin/push-queue" className="group p-6 bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] hover:bg-indigo-600 transition-all">
                    <div className="flex items-center">
                        <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <ClockIcon className="w-8 h-8" />
                        </div>
                        <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Fila de Push</h2>
                    </div>
                    <p className="mt-4 text-gray-400 text-sm group-hover:text-indigo-100">Verifique os lembretes de postagem agendados.</p>
                </Link>

                <Link to="/admin/email-templates" className="group p-6 bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] hover:bg-gray-700 transition-all">
                    <div className="flex items-center">
                        <div className="p-3 rounded-2xl bg-gray-500/20 text-gray-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <PencilIcon className="w-8 h-8" />
                        </div>
                        <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Email Templates</h2>
                    </div>
                    <p className="mt-4 text-gray-400 text-sm group-hover:text-white">Edite o HTML dos e-mails de boas-vindas e análise.</p>
                </Link>

                <Link to="/admin/cleanup" className="group p-6 bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] hover:bg-red-900 transition-all">
                    <div className="flex items-center">
                        <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <TrashIcon className="w-8 h-8" />
                        </div>
                        <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Limpeza Storage</h2>
                    </div>
                    <p className="mt-4 text-gray-400 text-sm group-hover:text-red-100">Apague prints de eventos antigos para economizar espaço.</p>
                </Link>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;