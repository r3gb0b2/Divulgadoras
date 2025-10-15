

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { UsersIcon, MapPinIcon, KeyIcon, BuildingOfficeIcon, ClipboardDocumentListIcon, EnvelopeIcon } from '../components/Icons';

type TestStatus = { type: 'idle' | 'loading' | 'success' | 'error', message: string };
type SystemStatus = {
    emailProvider: string;
    configured: boolean;
    message: string;
} | null;


const SuperAdminDashboard: React.FC = () => {
    const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({
        generic: { type: 'idle', message: '' },
        approved: { type: 'idle', message: '' },
        rejected: { type: 'idle', message: '' },
    });
    const [systemStatus, setSystemStatus] = useState<SystemStatus>(null);
    const [isCheckingStatus, setIsCheckingStatus] = useState(true);

    useEffect(() => {
        const checkSystemStatus = async () => {
            setIsCheckingStatus(true);
            try {
                const getStatus = httpsCallable(functions, 'getSystemStatus');
                const result = await getStatus();
                setSystemStatus(result.data as SystemStatus);
            } catch (error) {
                console.error("Failed to get system status:", error);
                setSystemStatus({
                    emailProvider: 'Desconhecido',
                    configured: false,
                    message: 'Não foi possível verificar o status do sistema de e-mail. Verifique os logs da função.'
                });
            } finally {
                setIsCheckingStatus(false);
            }
        };

        checkSystemStatus();
    }, []);


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
            const detailedError = error?.details?.originalError;
            const errorMessage = detailedError || error.message || 'Ocorreu um erro desconhecido.';
            setTestStatuses(prev => ({ ...prev, [testType]: { type: 'error', message: `Falha no envio: ${errorMessage}` } }));
        }
    };

    const renderSystemStatus = () => {
        if (isCheckingStatus) {
            return (
                 <div className="bg-gray-700/50 p-4 rounded-lg flex items-center gap-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <p className="font-semibold text-gray-300">Verificando configuração do sistema de e-mail...</p>
                 </div>
            );
        }

        if (!systemStatus) return null;

        const isOk = systemStatus.configured;

        return (
             <div className={`${isOk ? 'bg-green-900/50 border-green-700 text-green-300' : 'bg-red-900/50 border-red-700 text-red-300'} border p-4 rounded-lg`}>
                <h3 className="font-bold text-lg flex items-center gap-2">
                     {isOk ? (
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     ) : (
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     )}
                    Verificação do Servidor de E-mail
                </h3>
                <div className="mt-2 text-sm space-y-1">
                    <p><strong>Provedor Detectado:</strong> {systemStatus.emailProvider}</p>
                    <p><strong>Status da Configuração:</strong> <span className="font-semibold">{isOk ? "OK" : "ERRO"}</span></p>
                    <p><strong>Mensagem:</strong> {systemStatus.message}</p>
                    {!isOk && <p className="mt-2 font-semibold">AÇÃO NECESSÁRIA: Configure as variáveis de ambiente das suas Firebase Functions para que o envio de e-mail funcione.</p>}
                </div>
             </div>
        );
    }
    
    return (
        <div>
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
                </div>
            </div>

            <div className="mt-8 bg-secondary shadow-lg rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-4 text-white">Ferramentas de Diagnóstico</h2>
                <div className="mb-6">
                   {renderSystemStatus()}
                </div>
                <div className="space-y-4">
                    {/* Teste Genérico */}
                    <div className="bg-gray-700/50 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-gray-100">Teste de Conexão Moosend</h3>
                            <p className="text-sm text-gray-400 mt-1">
                                Envia um e-mail simples para <span className="font-medium text-gray-300">r3gb0b@gmail.com</span> para verificar a conexão com a API da <strong>Moosend</strong>.
                            </p>
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
                     {testStatuses.generic.type !== 'idle' && testStatuses.generic.type !== 'loading' && (
                        <div className={`p-3 rounded-md text-sm ${testStatuses.generic.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            <p><span className="font-bold">{testStatuses.generic.type === 'success' ? 'Sucesso:' : 'Erro:'}</span> {testStatuses.generic.message}</p>
                        </div>
                     )}

                     {/* Teste de Aprovação */}
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

                     {/* Teste de Rejeição */}
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
            </div>
        </div>
    );
};

export default SuperAdminDashboard;