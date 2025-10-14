import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminApplications, deleteAdminApplication, acceptAdminApplication } from '../services/adminService';
import { getOrganizations } from '../services/organizationService';
import { AdminApplication, Organization } from '../types';
import { Timestamp } from 'firebase/firestore';

// Approval Modal Component
const ApprovalModal: React.FC<{
    application: AdminApplication;
    organizations: Organization[];
    onClose: () => void;
    onConfirm: (app: AdminApplication, orgId: string) => Promise<void>;
}> = ({ application, organizations, onClose, onConfirm }) => {
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState('');

    const handleConfirmClick = async () => {
        if (!selectedOrgId) {
            setError('Por favor, selecione uma organização.');
            return;
        }
        setIsConfirming(true);
        setError('');
        try {
            await onConfirm(application, selectedOrgId);
            onClose(); // Close on success
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Aprovar Administrador</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-4">
                    <p className="text-gray-300">Aprovando acesso para <span className="font-bold text-white">{application.name}</span> ({application.email}).</p>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Atribuir à Organização</label>
                        <select
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                            required
                        >
                            <option value="" disabled>Selecione...</option>
                            {organizations.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirmClick}
                        disabled={isConfirming}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                        {isConfirming ? 'Confirmando...' : 'Confirmar Aprovação'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminApplicationsListPage: React.FC = () => {
    const [applications, setApplications] = useState<AdminApplication[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // State for modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedApp, setSelectedApp] = useState<AdminApplication | null>(null);

    const fetchApplications = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [apps, orgs] = await Promise.all([
                getAdminApplications(),
                getOrganizations()
            ]);
            setApplications(apps);
            // Sort orgs for the dropdown
            orgs.sort((a,b) => a.name.localeCompare(b.name));
            setOrganizations(orgs);
        } catch (err: any) {
            setError(err.message || "Não foi possível carregar as solicitações.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    const handleAccept = (app: AdminApplication) => {
        setSelectedApp(app);
        setIsModalOpen(true);
    };

    const handleConfirmApproval = async (app: AdminApplication, orgId: string) => {
        setIsProcessing(app.id);
        setError(null);
        try {
            await acceptAdminApplication(app, orgId);
            await fetchApplications(); // Refresh the list
        } catch (err: any) {
            // Re-throw to show error in modal
            throw err;
        } finally {
            setIsProcessing(null);
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
                                <p className="font-bold text-lg text-white">{app.name}</p>
                                <p className="text-sm text-gray-300">{app.email} | {app.phone}</p>
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
                        <li>Clique em <strong>Aprovar</strong> para abrir a janela de aprovação.</li>
                        <li>Selecione a <strong>organização</strong> à qual o novo admin será vinculado.</li>
                        <li>Aprovar cria um usuário com permissão de 'Admin' e remove a solicitação da lista.</li>
                        <li>Clique em <strong>Recusar</strong> para remover permanentemente a solicitação.</li>
                    </ul>
                </div>
                {renderContent()}
            </div>
            {isModalOpen && selectedApp && (
                <ApprovalModal
                    application={selectedApp}
                    organizations={organizations}
                    onClose={() => setIsModalOpen(false)}
                    onConfirm={handleConfirmApproval}
                />
            )}
        </div>
    );
};

export default AdminApplicationsListPage;