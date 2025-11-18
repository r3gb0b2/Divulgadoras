
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getGroupRemovalRequests, updateGroupRemovalRequest, updatePromoter } from '../services/promoterService';
import { GroupRemovalRequest, Timestamp } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import firebase from 'firebase/compat/app';

const GroupRemovalsPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();

    const [requests, setRequests] = useState<GroupRemovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const data = await getGroupRemovalRequests(selectedOrgId);
            setRequests(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar solicitações.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleConfirmRemoval = async (request: GroupRemovalRequest) => {
        if (!adminData) return;
        if (!window.confirm(`Tem certeza que deseja confirmar a remoção de ${request.promoterName} do grupo do evento ${request.campaignName}? Ela será removida de todas as publicações ativas.`)) {
            return;
        }

        setProcessingId(request.id);
        setError(null);
        try {
            // This Cloud Function is expected to remove the promoter from all active assignments.
            const removePromoterFunc = httpsCallable(functions, 'removePromoterFromAllAssignments');
            await removePromoterFunc({ promoterId: request.promoterId });

            // Also update the promoter's status to reflect they are not in the group anymore.
            await updatePromoter(request.promoterId, { hasJoinedGroup: false });

            // Mark the request as completed.
            await updateGroupRemovalRequest(request.id, {
                status: 'completed',
                actionTakenBy: adminData.uid,
                // FIX: Use Firestore Timestamp for consistency
                actionTakenAt: firebase.firestore.Timestamp.now(),
            });

            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao processar a remoção.');
        } finally {
            setProcessingId(null);
        }
    };
    
    const handleIgnoreRequest = async (request: GroupRemovalRequest) => {
        if (!adminData) return;
        setProcessingId(request.id);
        setError(null);
        try {
             await updateGroupRemovalRequest(request.id, {
                status: 'ignored',
                actionTakenBy: adminData.uid,
                // FIX: Use Firestore Timestamp for consistency
                actionTakenAt: firebase.firestore.Timestamp.now(),
            });
            await fetchData();
        } catch (err: any) {
             setError(err.message || 'Falha ao ignorar a solicitação.');
        } finally {
            setProcessingId(null);
        }
    };

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('pt-BR');
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        }
        if (error) {
            return <p className="text-red-400 text-center">{error}</p>;
        }
        if (requests.length === 0) {
            return <p className="text-gray-400 text-center py-8">Nenhuma solicitação de remoção pendente.</p>;
        }
        return (
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data da Solicitação</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {requests.map(req => (
                            <tr key={req.id} className="hover:bg-gray-700/40">
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <p className="font-medium text-white">{req.promoterName}</p>
                                    <p className="text-sm text-gray-400">{req.promoterEmail}</p>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{req.campaignName}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{formatDate(req.requestedAt as Timestamp)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end items-center gap-4">
                                        <button onClick={() => handleIgnoreRequest(req)} disabled={processingId === req.id} className="text-gray-400 hover:text-gray-200 disabled:opacity-50">Ignorar</button>
                                        <button onClick={() => handleConfirmRemoval(req)} disabled={processingId === req.id} className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">Confirmar Remoção</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Solicitações de Remoção de Grupo</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Revise as solicitações de divulgadoras que desejam sair dos grupos de divulgação. A confirmação removerá a divulgadora de todas as tarefas ativas.
                </p>
                {renderContent()}
            </div>
        </div>
    );
};

export default GroupRemovalsPage;
