import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getWhatsAppRemindersPage, sendWhatsAppReminderImmediately } from '../services/postService';
import { WhatsAppReminder, Timestamp } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { getOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import firebase from 'firebase/compat/app';

const PAGE_SIZE = 15;

const AdminWhatsAppReminders: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    
    // Pagination state
    const [pages, setPages] = useState<WhatsAppReminder[][]>([]);
    const [cursors, setCursors] = useState<(firebase.firestore.QueryDocumentSnapshot | null)[]>([null]);
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const [organizations, setOrganizations] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchReminders = useCallback(async (pageIndex: number) => {
        if (pageIndex < pages.length) {
            setCurrentPage(pageIndex);
            return;
        }

        if (pageIndex >= cursors.length || !hasMore) {
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const { reminders: newReminders, lastVisible } = await getWhatsAppRemindersPage(PAGE_SIZE, cursors[pageIndex]);
            
            setPages(prev => [...prev, newReminders]);
            
            if (lastVisible) {
                setCursors(prev => [...prev, lastVisible]);
            } else {
                setHasMore(false);
            }
            
            setCurrentPage(pageIndex);

        } catch (err: any) {
            setError(err.message || "Falha ao carregar lembretes.");
        } finally {
            setIsLoading(false);
        }
    }, [pages.length, cursors, hasMore]);


    useEffect(() => {
        if (adminData?.role !== 'superadmin') {
            setError("Acesso negado.");
            setIsLoading(false);
            return;
        }

        getOrganizations()
            .then(orgsData => setOrganizations(new Map(orgsData.map(org => [org.id, org.name]))))
            .catch(() => setError("Falha ao carregar organizações."));

        fetchReminders(0);
    }, [adminData?.role, fetchReminders]);
    
    const handleSendNow = async (id: string) => {
        setProcessingId(id);
        setError('');
        try {
            await sendWhatsAppReminderImmediately(id);
            setPages(prevPages => {
                const newPages = [...prevPages];
                const currentPageReminders = newPages[currentPage];
                if (currentPageReminders) {
                    newPages[currentPage] = currentPageReminders.map(r => r.id === id ? { ...r, status: 'sent' } : r);
                }
                return newPages;
            });
        } catch (err: any) {
             const friendlyError = (err as Error).message.includes("Z-API not configured")
                ? "Erro: A integração com Z-API não está configurada. Verifique o painel principal do Super Admin."
                : (err as Error).message;
            setError(friendlyError);
        } finally {
            setProcessingId(null);
        }
    };
    
    const formatDate = (ts: any) => {
        if (!ts) return "N/A";
        const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
        return date.toLocaleString('pt-BR');
    };

    const getStatusBadge = (status: WhatsAppReminder['status']) => {
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            sent: "bg-green-900/50 text-green-300",
            error: "bg-red-900/50 text-red-300",
        };
        const text = { pending: "Pendente", sent: "Enviado", error: "Erro" };
        return <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    const handleNext = () => {
        if (!isLoading) {
            fetchReminders(currentPage + 1);
        }
    };

    const handlePrev = () => {
        if (currentPage > 0) {
            setCurrentPage(currentPage - 1);
        }
    };

    const currentReminders = pages[currentPage] || [];

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Lembretes de WhatsApp Agendados</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
                {isLoading && pages.length === 0 ? <p className="text-center py-8">Carregando...</p> : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Organização</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Enviar Em</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {currentReminders.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum lembrete encontrado nesta página.</td></tr>
                                    ) : (
                                        currentReminders.map(reminder => (
                                            <tr key={reminder.id} className="hover:bg-gray-700/40">
                                                <td className="px-4 py-3"><p className="font-medium text-white">{reminder.promoterName}</p><p className="text-sm text-gray-400">{reminder.promoterWhatsapp}</p></td>
                                                <td className="px-4 py-3 text-sm text-gray-300">{reminder.postCampaignName}</td>
                                                <td className="px-4 py-3 text-sm text-gray-300">{organizations.get(reminder.organizationId) || reminder.organizationId}</td>
                                                <td className="px-4 py-3 text-sm text-gray-300">{formatDate(reminder.sendAt)}</td>
                                                <td className="px-4 py-3">{getStatusBadge(reminder.status)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {reminder.status === 'pending' && (
                                                        <button onClick={() => handleSendNow(reminder.id)} disabled={processingId === reminder.id} className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm disabled:opacity-50">
                                                            {processingId === reminder.id ? 'Enviando...' : 'Enviar Agora'}
                                                        </button>
                                                    )}
                                                    {reminder.status === 'error' && reminder.error && (
                                                        <p className="text-xs text-red-400" title={reminder.error}>Erro no envio</p>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-6 flex justify-between items-center">
                            <button onClick={handlePrev} disabled={currentPage === 0 || isLoading} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:opacity-50">
                                Anterior
                            </button>
                            <span className="text-sm text-gray-400">Página {currentPage + 1}</span>
                            <button onClick={handleNext} disabled={!hasMore || isLoading} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:opacity-50">
                                {isLoading ? 'Carregando...' : 'Próxima'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminWhatsAppReminders;
