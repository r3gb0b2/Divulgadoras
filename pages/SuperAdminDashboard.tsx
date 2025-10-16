import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { UsersIcon, MapPinIcon, KeyIcon, BuildingOfficeIcon, ClipboardDocumentListIcon, EnvelopeIcon, SparklesIcon, CreditCardIcon } from '../components/Icons';

type TestStatus = { type: 'idle' | 'loading' | 'success' | 'error', message: string };
type SystemStatus = {
    functionVersion?: string;
    emailProvider: string;
    configured: boolean;
    message: string;
    details?: string[];
} | null;

const FRONTEND_VERSION = "15.0"; // Must match version in AdminAuth.tsx

const SuperAdminDashboard: React.FC = () => {
    const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({
        generic: { type: 'idle', message: '' },
        approved: { type: 'idle', message: '' },
        rejected: { type: 'idle', message: '' },
    });
    const [systemStatus, setSystemStatus] = useState<SystemStatus>(null);
    const [isCheckingStatus, setIsCheckingStatus] = useState(true);
    const [isSyncError, setIsSyncError] = useState(false);

    const checkSystemStatus = useCallback(async () => {
        setIsCheckingStatus(true);
        try {
            const getStatus = httpsCallable(functions, 'getSystemStatus');
            const result = await getStatus();
            const statusData = result.data as SystemStatus;
            setSystemStatus(statusData);

            const backendVersion = statusData?.functionVersion?.split('-')[0] || '';
            const frontendVersionMajor = FRONTEND_VERSION.split('.')[0];
            const backendVersionMajor = backendVersion.replace('v','').split('.')[0];
            
            if (statusData?.emailProvider === "Erro no Servidor" || (backendVersion && frontendVersionMajor !== backendVersionMajor)) {
                setIsSyncError(true);
            } else {
                setIsSyncError(false);
            }

        } catch (error) {
            console.error("Failed to call getSystemStatus function:", error);
            setSystemStatus({
                emailProvider: 'Erro Crítico',
                configured: false,
                message: 'Falha ao comunicar com a função do servidor. A função pode não existir ou estar com erro grave.',
                details: [String(error)]
            });
            setIsSyncError(true);
        } finally {
            setIsCheckingStatus(false);
        }
    }, []);


    useEffect(() => {
        checkSystemStatus();
    }, [checkSystemStatus]);


    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleSendTestEmail = async (testType: 'generic' | 'approved' | 'rejected') => {
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

    const renderSyncErrorWarning = () => (
        <div className="bg-red-900/50 border-2 border-red-600 text-red-200 p-6 rounded-lg mb-6">
            <h3 className="font-extrabold text-2xl mb-3 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.636-1.21 2.37-1.21 3.006 0l4.312 8.225c.606 1.157-.23 2.625-1.503 2.625H5.448c-1.273 0-2.109-1.468-1.503-2.625L8.257 3.099zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                ERRO CRÍTICO DE SINCRONIZAÇÃO
            </h3>
            <p className="mb-2">Seu painel (<strong>Frontend v{FRONTEND_VERSION}</strong>) não está sincronizado com o servidor (<strong>Backend {systemStatus?.functionVersion || 'indisponível'}</strong>).</p>
            <p className="mb-4">Isso geralmente acontece quando uma dependência do servidor não foi instalada. Siga os passos abaixo para resolver:</p>
            
            {systemStatus?.details && (
                <div className="mb-4">
                    <p className="font-semibold">Mensagem de erro do servidor:</p>
                    <pre className="text-xs bg-black/40 p-2 rounded mt-1 whitespace-pre-wrap"><code>{systemStatus.details.join('\n')}</code></pre>
                </div>
            )}
            
            <div className="space-y-3 text-sm bg-black/30 p-4 rounded-md">
                <p><strong>Passo 1: Abra o terminal na pasta `functions`</strong><br/>
                No seu computador, navegue até a pasta `functions` dentro do seu projeto.</p>
                <pre className="bg-gray-800 p-2 rounded text-white overflow-x-auto"><code>cd functions</code></pre>

                <p><strong>Passo 2: Instale as dependências</strong><br/>
                Execute o comando abaixo para garantir que todos os pacotes do servidor estão instalados.</p>
                <pre className="bg-gray-800 p-2 rounded text-white overflow-x-auto"><code>npm install</code></pre>

                <p><strong>Passo 3: Volte para a pasta raiz e faça o deploy</strong><br/>
                Depois de instalar, volte e execute o deploy novamente.</p>
                 <pre className="bg-gray-800 p-2 rounded text-white overflow-x-auto"><code>cd ..{'\n'}firebase deploy --only functions</code></pre>

                <p><strong>Passo 4: Verifique o resultado</strong><br/>
                Após o deploy ser concluído, atualize esta página. Este alerta deverá desaparecer.</p>
            </div>
        </div>
    );

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
    
        let guideTitle = "⚠️ Ação Necessária: Configurar Envio de E-mail";
        let guideMessage = `O sistema detectou que o serviço de e-mail (${systemStatus.emailProvider}) não está configurado corretamente.`;
        if (systemStatus.message.includes("INVÁLIDA")) {
            guideTitle = "⚠️ Erro de Configuração: Chave de API Inválida";
            guideMessage = "A verificação com a Brevo falhou. A chave da API configurada parece estar incorreta ou não ter as permissões necessárias. Por favor, gere uma nova chave e reconfigure."
        }
        
        return (
            <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 p-6 rounded-lg">
                <h3 className="font-bold text-xl mb-3">{guideTitle}</h3>
                <p className="mb-4">{guideMessage}</p>
                <div className="space-y-4 text-sm">
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
            {isSyncError && renderSyncErrorWarning()}

            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
                 <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                    Sair
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
                    
                     <Link to="/admin/users" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <KeyIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Usuários Admin</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar todos os usuários administradores da plataforma.</p>
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

                    <Link to="/admin/states" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <MapPinIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Localidades</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Ativar, desativar e definir regras gerais para as localidades de inscrição.</p>
                         <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Acessar &rarr;</div>
                    </Link>
                    
                    <Link to="/admin/settings/pagseguro" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <CreditCardIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Pagamentos</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Configurar a integração de pagamentos com PagSeguro.</p>
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
                
                {isSyncError ? (
                     <div className="text-center p-6 bg-gray-700/50 rounded-lg">
                        <p className="font-bold text-yellow-400">Ferramentas de teste de e-mail desativadas.</p>
                        <p className="text-gray-400 text-sm">Resolva o problema de sincronização para habilitá-las.</p>
                    </div>
                ) : systemStatus?.configured ? (
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

                        <div className="bg-gray-700/50 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-gray-100">Teste de E-mail de Rejeição</h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    Simula e envia um e-mail de <strong>rejeição</strong> para você, usando o template real.
                                </p>
                            </div>
                            <button 
                                onClick={() => handleSendTestEmail('rejected')}
                                disabled={testStatuses.rejected.type === 'loading'}
                                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-semibold disabled:opacity-50 text-sm"
                            >
                            <EnvelopeIcon className="w-5 h-5"/>
                            {testStatuses.rejected.type === 'loading' ? 'Enviando...' : 'Testar Rejeição'}
                            </button>
                        </div>
                        {testStatuses.rejected.type !== 'idle' && testStatuses.rejected.type !== 'loading' && (
                            <div className={`p-3 rounded-md text-sm ${testStatuses.rejected.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                                <p><span className="font-bold">{testStatuses.rejected.type === 'success' ? 'Sucesso:' : 'Erro:'}</span> {testStatuses.rejected.message}</p>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default SuperAdminDashboard;