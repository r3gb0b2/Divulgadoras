import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getGuestListChangeRequests, updateGuestListChangeRequest, unlockGuestListConfirmation } from '../services/guestListService';
import { GuestListChangeRequest, Timestamp } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import firebase from 'firebase/compat/app';

const GuestListChangeRequestsPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();

    const [requests, setRequests] = useState<GuestListChangeRequest[]>([]);
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
            const data = await getGuestListChangeRequests(selectedOrgId);
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
    
    const handleApprove = async (request: GuestListChangeRequest) => {
        if (!adminData) return;
        setProcessingId(request.id);
        setError(null);
        try {
            // Unlock the list for the promoter
            await unlockGuestListConfirmation(request.confirmationId);
            
            // Mark the request as approved
            await updateGuestListChangeRequest(request.id, {
                status: 'approved',
                actionTakenBy: adminData.uid,
                // FIX: Use Firestore Timestamp
                actionTakenAt: firebase.firestore.Timestamp.now(),
            });
            
            await fetchData();
        } catch (err: any) {
             setError(err.message || 'Falha ao aprovar a solicitação.');
             // If something fails, try to re-lock the list to maintain consistency (best effort)
             await updateGuestListChangeRequest(request.id, { status: 'pending' });
        } finally {
            setProcessingId(null);
        }
    };
    
    const handleReject = async (request: GuestListChangeRequest) => {
        if (!adminData) return;
        setProcessingId(request.id);
        setError(null);
        try {
             await updateGuestListChangeRequest(request.id, {
                status: 'rejected',
                actionTakenBy: adminData.uid,
                // FIX: Use Firestore Timestamp
                actionTakenAt: firebase.firestore.Timestamp.now(),
            });
            await fetchData();
        } catch (err: any) {
             setError(err.message || 'Falha ao rejeitar a solicitação.');
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
            return <p className="text-gray-400 text-center py-8">Nenhuma solicitação de alteração de lista pendente.</p>;
        }
        return (
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento / Lista</th>
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
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <p className="font-medium text-white">{req.campaignName}</p>
                                    <p className="text-sm text-gray-400">{req.listName}</p>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{formatDate(req.requestedAt as Timestamp)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end items-center gap-4">
                                        <button onClick={() => handleReject(req)} disabled={processingId === req.id} className="text-red-400 hover:text-red-300 disabled:opacity-50">Rejeitar</button>
                                        <button onClick={() => handleApprove(req)} disabled={processingId === req.id} className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">Aprovar</button>
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
                <h1 className="text-3xl font-bold">Solicitações de Alteração de Lista</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Revise as solicitações de divulgadoras que desejam editar uma lista de convidados já enviada. A aprovação irá liberar a lista para edição.
                </p>
                {renderContent()}
            </div>
        </div>
    );
};

export default GuestListChangeRequestsPage;
