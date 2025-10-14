import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminApplications, deleteAdminApplication, acceptAdminApplication } from '../services/adminService';
import { AdminApplication } from '../types';
import { Timestamp } from 'firebase/firestore';

const AdminApplicationsListPage: React.FC = () => {
    const [applications, setApplications] = useState<AdminApplication[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchApplications = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const apps = await getAdminApplications();
            setApplications(apps);
        } catch (err: any) {
            setError(err.message || "Não foi possível carregar as solicitações.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    const handleAccept = async (app: AdminApplication) => {
        if (window.confirm(`Tem certeza que deseja aprovar o acesso para ${app.orgName}? Uma nova organização e um usuário admin serão criados.`)) {
            setIsProcessing(app.id);
            setError(null);
            try {
                await acceptAdminApplication(app);
                await fetchApplications(); // Refresh the list
            } catch (err: any) {
                setError(err.message || "Falha ao aprovar a solicitação.");
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja recusar e remover esta solicitação? Esta ação é permanente.")) {
            try {
                await deleteAdminApplication(id);
                fetchApplications(); // Refresh the list
            } catch (err: any) {
                setError(err.message || "Falha ao remover a solicitação.");
            }
        }
    };

    const formatDate = (timestamp: Timestamp | undefined) => {
        if (!timestamp) return 'N/A';
        return timestamp.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            );
        }
        if (error) {
            return <p className="text-red-400 text-center">{error}</p>;
        }
        if (applications.length === 0) {
            return <p className="text-gray-400 text-center py-8">Nenhuma solicitação de acesso pendente.</p>;
        }
        return (
            <div className="space-y-4">
                {applications.map(app => (
                    <div key={app.id} className="bg-gray-700/50 p-4 rounded-lg">
                        <div className="flex flex-col md:flex-row justify-between md:items-start">
                            <div>
                                <p className="font-bold text-lg text-white">{app.orgName}</p>
                                <p className="text-sm text-gray-300">Contato: {app.name}</p>
                                <p className="text-sm text-gray-400">{app.email} | {app.phone}</p>
                                {app.message && <p className="text-sm text-gray-400 mt-2 italic border-l-2 border-gray-600 pl-2">"{app.message}"</p>}
                            </div>
                            <div className="flex-shrink-0 mt-3 md:mt-0 text-right space-y-2">
                                <p className="text-xs text-gray-500">Enviado em: {formatDate(app.createdAt)}</p>
                                <div className="flex justify-end gap-2">
                                     <button
                                        onClick={() => handleAccept(app)}
                                        disabled={isProcessing === app.id}
                                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-semibold disabled:opacity-50"
                                    >
                                        {isProcessing === app.id ? 'Aprovando...' : 'Aprovar'}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(app.id)}
                                        disabled={isProcessing === app.id}
                                        className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm disabled:opacity-50"
                                    >
                                        Recusar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Solicitações de Acesso</h1>
                <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    &larr; Voltar ao Painel
                </Link>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="bg-blue-900/50 border border-blue-700 text-blue-300 p-3 mb-6 rounded-md text-sm">
                    <p className="font-bold">Como processar uma solicitação:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Clique em <strong>Aprovar</strong> para criar a organização e liberar o acesso do usuário automaticamente. Ele poderá fazer login com o e-mail e senha que cadastrou.</li>
                        <li>Clique em <strong>Recusar</strong> para remover permanentemente a solicitação da lista.</li>
                    </ul>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminApplicationsListPage;