
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
// FIX: Removed modular signOut import to use compat syntax.
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { UsersIcon, MapPinIcon, KeyIcon, BuildingOfficeIcon, ClipboardDocumentListIcon, EnvelopeIcon, SparklesIcon, CreditCardIcon, MegaphoneIcon, SearchIcon, ChartBarIcon, WhatsAppIcon, ClockIcon, TrashIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { cleanupOldProofs } from '../services/postService';

type TestStatus = { type: 'idle' | 'loading' | 'success' | 'error', message: string };
type SystemStatusLogEntry = { level: 'INFO' | 'SUCCESS' | 'ERROR'; message: string };
type SystemStatus = {
    functionVersion?: string;
    emailProvider: string;
    configured: boolean;
    message: string;
    log?: SystemStatusLogEntry[];
} | null;

const FRONTEND_VERSION = "19.0"; // Must match version in AdminAuth.tsx

const SuperAdminDashboard: React.FC = () => {
    const { selectedOrgId } = useAdminAuth();
    const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({
        generic: { type: 'idle', message: '' },
        approved: { type: 'idle', message: '' },
    });
    const [systemStatus, setSystemStatus] = useState<SystemStatus>(null);
    const [isCheckingStatus, setIsCheckingStatus] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);

    const checkSystemStatus = useCallback(async () => {
        setIsCheckingStatus(true);
        try {
            const getStatus = httpsCallable(functions, 'getSystemStatus');
            const result = await getStatus();
            const statusData = result.data as SystemStatus;
            setSystemStatus(statusData);
        } catch (error) {
            console.error("Failed to call getSystemStatus function:", error);
            setSystemStatus({
                emailProvider: 'Erro Crítico',
                configured: false,
                message: 'Falha ao comunicar com a função do servidor. A função pode não existir ou estar com erro grave.',
                log: [{ level: 'ERROR', message: String(error) }]
            });
        } finally {
            setIsCheckingStatus(false);
        }
    }, []);


    useEffect(() => {
        checkSystemStatus();
    }, [checkSystemStatus]);


    const handleLogout = async () => {
        try {
            // FIX: Use compat signOut method.
            await auth.signOut();
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleSendTestEmail = async (testType: 'generic' | 'approved') => {
        setTestStatuses(prev => ({ ...prev, [testType]: { type: 'loading', message: 'Enviando e-mail de teste...' } }));
        try {
            const sendTestEmail = httpsCallable(functions, 'sendTestEmail');
            const result = await sendTestEmail({ testType });
            const data = result.data as { success: boolean; message: string };
            if (data.success) {
                setTestStatuses(prev => ({ ...prev, [testType]: { type: 'success', message: data.message } }));
            } else {
                 throw new Error('A função retornou sucesso falso.');
            }
        } catch (error: any) {
            console.error("Test email failed", error);
            const detailedError = error?.details?.originalError || error.message || 'Ocorreu um erro desconhecido.';
            setTestStatuses(prev => ({ ...prev, [testType]: { type: 'error', message: `Falha no envio: ${detailedError}` } }));
        }
    };

    const handleCleanup = async () => {
        if (!selectedOrgId) {
            alert("Selecione uma organização no menu superior para executar a limpeza.");
            return;
        }
        
        const confirmMessage = "Tem certeza que deseja apagar PERMANENTEMENTE todas as imagens de comprovação de eventos marcados como 'Inativos' da organização selecionada?\n\nIsso liberará espaço no banco de dados. As imagens serão substituídas por um aviso visual.\n\nEsta ação não pode ser desfeita.";
        
        if (window.confirm(confirmMessage)) {
            setIsCleaning(true);
            try {
                const result = await cleanupOldProofs(selectedOrgId);
                alert(result.message);
            } catch (err: any) {
                alert(err.message);
            } finally {
                setIsCleaning(false);
            }
        }
    };
    
    const renderDiagnosticLog = (log: SystemStatusLogEntry[]) => {
        const levelStyles: { [key: string]: string } = {
            INFO: 'text-blue-300',
            SUCCESS: 'text-green-300',
            ERROR: 'text-red-300 font-bold',
        };
        return (
            <div className="mt-4">
                <h4 className="text-md font-semibold text-gray-200">Log de Diagnóstico:</h4>
                <pre className="text-xs bg-black/40 p-3 rounded mt-2 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                    {log.map((entry, index) => (
                        <div key={index} className={levelStyles[entry.level]}>
                            <span className="font-bold">[{entry.level}]</span> {entry.message}
                        </div>
                    ))}
                </pre>
            </div>
        );
    };

    const renderConfigurationGuide = () => {
        if (isCheckingStatus) {
            return (
                 <div className="bg-gray-700/50 p-4 rounded-lg flex items-center gap-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <p className="font-semibold text-gray-300">Verificando configuração do sistema...</p>
                 </div>
            );
        }
        
        if (!systemStatus) {
            return (
                <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">
                    <h3 className="font-bold">Erro Crítico</h3>
                    <p>Não foi possível comunicar com a função de verificação no servidor. Verifique os logs do Firebase.</p>
                </div>
            )
        }
    
        if (systemStatus.configured) {
             return (
                 <div className="bg-green-900/50 border border-green-700 text-green-300 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                        <h3 className="font-bold flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Sistema de E-mail Operacional
                        </h3>
                        <p className="mt-2 text-sm">{systemStatus.message}</p>
                        <p className="text-sm">Frontend: <strong className="font-mono">v{FRONTEND_VERSION}</strong> | Servidor: <strong className="font-mono">{systemStatus.functionVersion || 'Indisponível'}</strong></p>
                    </div>
                    <button 
                        onClick={() => handleSendTestEmail('generic')}
                        disabled={testStatuses.generic.type === 'loading'}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 font-semibold disabled:opacity-50 text-sm"
                    >
                        <EnvelopeIcon className="w-5 h-5"/>
                        {testStatuses.generic.type === 'loading' ? 'Enviando...' : 'Testar Conexão'}
                    </button>
                 </div>
             );
        }
    
        const hasErrorInLog = systemStatus.log?.some(l => l.level === 'ERROR');
        const guideTitle = hasErrorInLog ? "⚠️ Erro de Configuração Detectado" : "⚠️ Ação Necessária: Configurar Envio de E-mail";
        const guideMessage = systemStatus.message;
        
        return (
            <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 p-6 rounded-lg">
                <h3 className="font-bold text-xl mb-3">{guideTitle}</h3>
                <p className="mb-4">{guideMessage}</p>
                
                {systemStatus.log && renderDiagnosticLog(systemStatus.log)}
                
                <div className="space-y-4 text-sm mt-4">
                    <div>
                        <strong>Passo 1: Configure as variáveis no Firebase</strong>
                        <p className="text-gray-300">Execute o comando abaixo no terminal, substituindo os valores de exemplo.</p>
                        <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto">
                            <code>
                                {`firebase functions:config:set brevo.key="SUA_API_KEY" brevo.sender_email="seu@emailverificado.com"`}
                            </code>
                        </pre>
                        <p className="text-xs text-yellow-200/80 mt-1"><strong>Atenção:</strong> O e-mail remetente precisa ser de um remetente validado na sua conta Brevo.</p>
                    </div>
                    <div>
                        <strong>Passo 2: Faça o deploy das alterações</strong>
                         <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto">
                            <code>
                                firebase deploy --only functions
                            </code>
                        </pre>
                    </div>
                    <div className="border-t border-yellow-700/50 pt-4">
                         <strong>Passo 3: Verifique a configuração</strong>
                         <p className="text-gray-300">Após o deploy ser concluído, clique no botão abaixo para verificar a configuração sem precisar recarregar a página.</p>
                          <button 
                            onClick={checkSystemStatus}
                            disabled={isCheckingStatus}
                            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-semibold disabled:opacity-50 text-sm"
                        >
                            {isCheckingStatus ? 'Verificando...' : 'Verificar Novamente'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
                 <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                    Sair
                </button>
            </div>

            <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <TrashIcon className="w-6 h-6 text-red-400" />
                        Manutenção de Armazenamento
                    </h2>
                    <p className="text-gray-300 text-sm">
                        Limpar prints antigos de eventos inativos da organização selecionada ({selectedOrgId || 'Nenhuma selecionada'}). 
                        Isso ajuda a reduzir custos de armazenamento.
                    </p>
                </div>
                <button 
                    onClick={handleCleanup} 
                    disabled={isCleaning || !selectedOrgId}
                    className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-md disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                    {isCleaning ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Limpando...
                        </>
                    ) : (
                        'Executar Limpeza'
                    )}
                </button>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                 <p className="text-gray-400 mb-6">
                    Use os links abaixo para gerenciar a plataforma.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Link to="/admin/promoters" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <UsersIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Todas as Divulgadoras</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Ver e gerenciar todas as inscrições de todas as organizações.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/organizations" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Organizações</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Ativar, ocultar, excluir e gerenciar os planos das organizações clientes.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/whatsapp-reminders" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <WhatsAppIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Lembretes WhatsApp</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Visualizar lembretes agendados e enviar imediatamente.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>
                    
                     <Link to="/admin/scheduled-posts" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ClockIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Agendamentos de Posts</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Visualizar posts agendados e enviar imediatamente.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>
                    
                    <Link to="/admin/whatsapp-campaign" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <WhatsAppIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Campanha WhatsApp</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Envie mensagens em massa via WhatsApp para as divulgadoras.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/applications" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ClipboardDocumentListIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Solicitações de Acesso</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Analisar e aprovar novas solicitações de cadastro de organizadores.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Analisar &rarr;</div>
                    </Link>
                    
                    <Link to="/admin/newsletter" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <EnvelopeIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Newsletter</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Enviar e-mails em massa para as divulgadoras de toda a plataforma.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Enviar &rarr;</div>
                    </Link>

                    <Link to="/admin/states" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <MapPinIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Regiões</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Ativar, desativar e definir regras gerais para as regiões de inscrição.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>
                    
                     <Link to="/admin/posts" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <MegaphoneIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciamento de Posts</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Criar e acompanhar publicações para as divulgadoras.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>
                    
                    <Link to="/admin/lists" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ClipboardDocumentListIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Listas</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Criar e gerenciar listas de convidados com links e atribuições individuais.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/dashboard" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ChartBarIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Desempenho das Divulgadoras</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Analise o aproveitamento, posts perdidos e justificativas por divulgadora.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Analisar &rarr;</div>
                    </Link>

                     <Link to="/admin/diagnostics" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <SearchIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Diagnóstico de Divulgadora</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Busque todos os dados de uma divulgadora por e-mail para investigar problemas.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Investigar &rarr;</div>
                    </Link>

                    <Link to="/admin/settings/stripe" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <CreditCardIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Pagamentos</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Configurar a integração de pagamentos com Stripe.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Configurar &rarr;</div>
                    </Link>

                    <Link to="/admin/settings/email" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <EnvelopeIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Template de E-mail</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Personalizar o e-mail de aprovação enviado para as divulgadoras.</p>
                        <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Editar &rarr;</div>
                    </Link>
                    
                    <Link to="/admin/gemini" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <SparklesIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Assistente Gemini</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerar textos criativos, ideias, e auxiliar em tarefas administrativas.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>

                     <Link to="/admin/users" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <KeyIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Usuários Admin</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar todos os usuários administradores da plataforma.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>
                </div>
            </div>

            <div className="mt-8 bg-secondary shadow-lg rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-4 text-white">Diagnóstico e Ações</h2>
                <div className="mb-6">
                   {renderConfigurationGuide()}
                   {testStatuses.generic.type !== 'idle' && testStatuses.generic.type !== 'loading' && (
                        <div className={`p-3 mt-4 rounded-md text-sm ${testStatuses.generic.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            <p><span className="font-bold">{testStatuses.generic.type === 'success' ? 'Sucesso:' : 'Erro:'}</span> {testStatuses.generic.message}</p>
                        </div>
                    )}
                </div>
                
                {systemStatus?.configured ? (
                    <div className="space-y-4 border-t border-gray-700 pt-6 mt-6">
                        <div className="bg-gray-700/50 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-gray-100">Teste de E-mail de Aprovação</h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    Simula e envia um e-mail de <strong>aprovação</strong> para você, usando o template real.
                                </p>
                            </div>
                            <button 
                                onClick={() => handleSendTestEmail('approved')}
                                disabled={testStatuses.approved.type === 'loading'}
                                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold disabled:opacity-50 text-sm"
                            >
                            <EnvelopeIcon className="w-5 h-5"/>
                            {testStatuses.approved.type === 'loading' ? 'Enviando...' : 'Testar Aprovação'}
                            </button>
                        </div>
                        {testStatuses.approved.type !== 'idle' && testStatuses.approved.type !== 'loading' && (
                            <div className={`p-3 rounded-md text-sm ${testStatuses.approved.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                                <p><span className="font-bold">{testStatuses.approved.type === 'success' ? 'Sucesso:' : 'Erro:'}</span> {testStatuses.approved.message}</p>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
