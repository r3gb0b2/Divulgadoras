
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
    RefreshIcon
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
            alert("Teste de diagnóstico concluído. Verifique o resultado abaixo do botão.");
        } catch (err: any) {
            alert("Erro ao chamar a função de teste: " + err.message);
        } finally {
            setIsTestingWa(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Painel Super Admin</h1>
            
            {/* NOVO: FERRAMENTA DE DIAGNÓSTICO WHATSAPP */}
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-6 mb-8">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <WhatsAppIcon className="w-6 h-6 text-green-400" />
                    Diagnóstico WhatsApp (Z-API)
                </h2>
                <p className="text-sm text-gray-300 mb-4">Use esta ferramenta para verificar se o servidor consegue se comunicar com a Z-API usando as chaves configuradas.</p>
                
                <button 
                    onClick={handleTestWhatsApp}
                    disabled={isTestingWa}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-all font-semibold"
                >
                    {isTestingWa ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <WhatsAppIcon className="w-4 h-4" />}
                    {isTestingWa ? "Testando..." : "Testar Conexão WhatsApp"}
                </button>

                {waTestResult && (
                    <div className="mt-4 p-4 bg-black/50 rounded-lg border border-gray-700 font-mono text-[10px] space-y-2">
                        <p><span className="text-gray-500">Instance ID:</span> <span className="text-white">{waTestResult.instanceId}</span></p>
                        <p><span className="text-gray-500">Token Status:</span> <span className="text-white">{waTestResult.tokenStatus}</span></p>
                        <p><span className="text-gray-500">Resultado do Envio:</span> 
                            <span className={waTestResult.result.success ? 'text-green-400' : 'text-red-400'}>
                                {waTestResult.result.success ? ' SUCESSO' : ' FALHA: ' + waTestResult.result.message}
                            </span>
                        </p>
                        {!waTestResult.result.success && waTestResult.result.raw && (
                            <pre className="mt-2 text-red-300">{JSON.stringify(waTestResult.result.raw, null, 2)}</pre>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link to="/admin/organizations" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Organizações</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Gerenciar todas as produtoras e agências cadastradas.</p>
                </Link>
                <Link to="/admin/applications" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <KeyIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Solicitações de Acesso</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Verificar pedidos de novos administradores.</p>
                </Link>
                <Link to="/admin/apple-test" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <FaceIdIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Apple Test Review</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Gerenciar inscritos para teste do app iOS.</p>
                </Link>
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
                <Link to="/admin/push-campaign" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300 border border-transparent hover:border-indigo-500">
                    <div className="flex items-center">
                        <FaceIdIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Campanha Push</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Envie notificações nativas diretamente para os celulares das divulgadoras.</p>
                </Link>
                <Link to="/admin/cleanup" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                    <div className="flex items-center">
                        <TrashIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Limpeza de Dados</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Remover prints antigos para liberar espaço.</p>
                </Link>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
