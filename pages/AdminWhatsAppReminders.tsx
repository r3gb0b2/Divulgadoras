import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllWhatsAppReminders, sendWhatsAppReminderImmediately } from '../services/postService';
import { WhatsAppReminder, Timestamp } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { getOrganizations } from '../services/organizationService';
import { Organization } from '../types';

const AdminWhatsAppReminders: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [reminders, setReminders] = useState<WhatsAppReminder[]>([]);
    const [organizations, setOrganizations] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (adminData?.role !== 'superadmin') {
            setError("Acesso negado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const [remindersData, orgsData] = await Promise.all([
                getAllWhatsAppReminders(),
                getOrganizations()
            ]);
            setReminders(remindersData);
            setOrganizations(new Map(orgsData.map(org => [org.id, org.name])));
        } catch (err: any) {
            setError(err.message || "Falha ao carregar lembretes.");
        } finally {
            setIsLoading(false);
        }
    }, [adminData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const handleSendNow = async (id: string) => {
        setProcessingId(id);
        setError('');
        try {
            await sendWhatsAppReminderImmediately(id);
            await fetchData();
        } catch (err: any) {
            setError(err.message || "Falha ao enviar lembrete.");
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
                {error && <p className="text-red-400 mb-4">{error}</p>}
                {isLoading ? <p className="text-center py-8">Carregando...</p> : (
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
                                {reminders.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum lembrete agendado.</td></tr>
                                ) : (
                                    reminders.map(reminder => (
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
                )}
            </div>
        </div>
    );
};

export default AdminWhatsAppReminders;