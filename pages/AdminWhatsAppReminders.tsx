
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { WhatsAppReminder } from '../types';
import { getAllWhatsAppReminders, sendWhatsAppReminderImmediately } from '../services/postService';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const formatReminderDate = (ts: any): string => {
    if (!ts) return "N/A";
    const date = (ts as Timestamp).toDate();
    return date.toLocaleString('pt-BR');
};

const AdminWhatsAppRemindersPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [reminders, setReminders] = useState<WhatsAppReminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await getAllWhatsAppReminders();
            setReminders(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar lembretes.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (adminData?.role === 'superadmin') {
            fetchData();
// FIX: Simplified the logic to remove a redundant comparison that was flagged as unintentional by the linter.
        } else if (adminData) {
            navigate('/admin');
        }
    }, [fetchData, adminData, navigate]);

    const handleSendNow = async (id: string) => {
        if (!window.confirm("Enviar este lembrete agora?")) return;
        setProcessingId(id);
        setError('');
        try {
            await sendWhatsAppReminderImmediately(id);
            alert("Lembrete enviado para a fila de processamento!");
            fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar.');
        } finally {
            setProcessingId(null);
        }
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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Lembretes Agendados (WhatsApp)</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {error && <p className="text-red-400 mb-4">{error}</p>}
                {isLoading ? <p className="text-center py-8">Carregando...</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Campanha</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Agendado Para</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {reminders.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum lembrete agendado.</td></tr>
                                ) : (
                                    reminders.map(r => (
                                        <tr key={r.id}>
                                            <td className="px-4 py-3"><p className="font-medium text-white">{r.promoterName}</p><p className="text-sm text-gray-400">{r.promoterWhatsapp}</p></td>
                                            <td className="px-4 py-3 text-sm text-gray-300">{r.postCampaignName}</td>
                                            <td className="px-4 py-3 text-sm text-gray-300">{formatReminderDate(r.sendAt)}</td>
                                            <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                                            <td className="px-4 py-3 text-right">
                                                {r.status === 'pending' && (
                                                    <button onClick={() => handleSendNow(r.id)} disabled={processingId === r.id} className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm disabled:opacity-50">
                                                        {processingId === r.id ? '...' : 'Enviar Agora'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminWhatsAppRemindersPage;
