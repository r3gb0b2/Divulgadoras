import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { UsersIcon, MapPinIcon, KeyIcon, BuildingOfficeIcon, ClipboardDocumentListIcon, EnvelopeIcon } from '../components/Icons';

const SuperAdminDashboard: React.FC = () => {
    const [testEmailStatus, setTestEmailStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleSendTestEmail = async () => {
        setTestEmailStatus({ type: 'loading', message: 'Enviando e-mail de teste...' });
        try {
            const sendTestEmail = httpsCallable(functions, 'sendTestEmail');
            const result = await sendTestEmail();
            const data = result.data as { success: boolean; message: string };
            if (data.success) {
                setTestEmailStatus({ type: 'success', message: data.message });
            } else {
                 throw new Error('A função retornou sucesso falso.');
            }
        } catch (error: any) {
            console.error("Test email failed", error);
            setTestEmailStatus({ type: 'error', message: `Falha no envio: ${error.message}` });
        }
    };
    
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
                <div className="bg-gray-700/50 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="font-semibold text-gray-100">Teste de Envio de E-mails</h3>
                        <p className="text-sm text-gray-400 mt-1">
                            Clique no botão para enviar um e-mail de teste para sua própria conta de Super Admin ({auth.currentUser?.email}). Isso verifica se a integração com a API (Brevo) está funcionando corretamente.
                        </p>
                    </div>
                    <button 
                        onClick={handleSendTestEmail}
                        disabled={testEmailStatus.type === 'loading'}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50"
                    >
                       <EnvelopeIcon className="w-5 h-5"/>
                       {testEmailStatus.type === 'loading' ? 'Enviando...' : 'Testar Envio'}
                    </button>
                </div>
                 {testEmailStatus.type !== 'idle' && testEmailStatus.type !== 'loading' && (
                    <div className={`mt-4 p-3 rounded-md text-sm ${testEmailStatus.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                        <p><span className="font-bold">{testEmailStatus.type === 'success' ? 'Sucesso:' : 'Erro:'}</span> {testEmailStatus.message}</p>
                    </div>
                 )}
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
