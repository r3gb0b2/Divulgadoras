
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
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
                        <p className="text-[9px] text-yellow-500 mt-2 italic">* Após rodar o comando, você precisa dar deploy: <strong>firebase deploy --only functions</strong></p>
                    </div>

                    <button 
                        onClick={handleTestWhatsApp}
                        disabled={isTestingWa}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-500 disabled:opacity-50 transition-all font-bold shadow-lg shadow-green-900/20"
                    >
                        {isTestingWa ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <WhatsAppIcon className="w-5 h-5" />}
                        {isTestingWa ? "Validando Chaves..." : "Testar Conexão Agora"}
                    </button>

                    {waTestResult && (
                        <div className="mt-6 p-5 bg-black/40 rounded-xl border border-gray-700 font-mono text-[11px] animate-fadeIn">
                            <h4 className="text-white font-bold mb-3 border-b border-gray-700 pb-2 flex justify-between">
                                <span>Relatório de Sistema:</span>
                                <span className={waTestResult.result.success ? 'text-green-400' : 'text-red-400'}>
                                    {waTestResult.result.success ? 'CONECTADO' : 'ERRO'}
                                </span>
                            </h4>
                            <div className="space-y-2">
                                <p><span className="text-gray-500">ID da Instância:</span> <span className="text-white">{waTestResult.instanceId}</span></p>
                                <p><span className="text-gray-500">Token Instância:</span> <span className={waTestResult.instanceToken === 'CONFIGURADO' ? 'text-green-400' : 'text-red-400'}>{waTestResult.instanceToken}</span></p>
                                <p><span className="text-gray-500">Client-Token:</span> <span className={waTestResult.clientToken === 'CONFIGURADO' ? 'text-green-400' : 'text-red-400'}>{waTestResult.clientToken}</span></p>
                                
                                <div className={`mt-4 p-3 rounded-lg border ${waTestResult.result.success ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-red-900/20 border-red-800 text-red-300'}`}>
                                    <p className="font-bold uppercase text-[9px] mb-1">Status do Último Envio:</p>
                                    <p>{waTestResult.result.message}</p>
                                    {waTestResult.result.raw && (
                                        <pre className="mt-2 text-[9px] opacity-70 overflow-x-auto">{JSON.stringify(waTestResult.result.raw, null, 2)}</pre>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ATALHOS RÁPIDOS */}
                <div className="bg-secondary p-6 rounded-2xl border border-gray-700">
                    <h2 className="text-xl font-bold text-white mb-4">Acesso Rápido</h2>
                    <div className="space-y-3">
                        <Link to="/admin/organizations" className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors">
                            <BuildingOfficeIcon className="w-5 h-5 text-primary" />
                            <span className="text-sm font-semibold">Organizações</span>
                        </Link>
                        <Link to="/admin/applications" className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors">
                            <KeyIcon className="w-5 h-5 text-primary" />
                            <span className="text-sm font-semibold">Solicitações de Acesso</span>
                        </Link>
                        <Link to="/admin/push-queue" className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors">
                            <FaceIdIcon className="w-5 h-5 text-indigo-400" />
                            <span className="text-sm font-semibold">Fila de Disparos Push</span>
                        </Link>
                        <Link to="/admin/cleanup" className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors">
                            <TrashIcon className="w-5 h-5 text-red-400" />
                            <span className="text-sm font-semibold">Limpeza de Dados</span>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link to="/admin/newsletter" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <EnvelopeIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Newsletter</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Enviar e-mails em massa para as divulgadoras.</p>
                </Link>
                <Link to="/admin/email-templates" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <PencilIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Templates de Email</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Editar o visual dos e-mails automáticos de aprovação.</p>
                </Link>
                <Link to="/admin/edit-privacy" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <ShieldCheckIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Política de Privacidade</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Atualizar o texto legal da plataforma.</p>
                </Link>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
