import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWhatsAppReminders, deleteWhatsAppReminder, sendWhatsAppReminderImmediately } from '../services/messageService';
import { WhatsAppReminder, Timestamp } from '../types';
import { ArrowLeftIcon, ClockIcon, CheckCircleIcon, XIcon, AlertTriangleIcon } from '../components/Icons';

const AdminWhatsAppReminders: React.FC = () => {
    const navigate = useNavigate();
    const [reminders, setReminders] = useState<WhatsAppReminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'sent' | 'error'>('all');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getWhatsAppReminders();
            setReminders(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar agendamentos.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDelete = async (reminderId: string) => {
        if (!window.confirm("Tem certeza que deseja cancelar este agendamento?")) return;
        setProcessingId(reminderId);
        try {
            await deleteWhatsAppReminder(reminderId);
            await fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleSendNow = async (reminderId: string) => {
        if (!window.confirm("Isso enviará o lembrete imediatamente, ignorando o agendamento. Deseja continuar?")) return;
        setProcessingId(reminderId);
        try {
            await sendWhatsAppReminderImmediately(reminderId);
            await fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };
    
    const filteredReminders = useMemo(() => {
        if (filter === 'all') return reminders;
        return reminders.filter(r => r.status === filter);
    }, [reminders, filter]);

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
        return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    const getStatusBadge = (status: WhatsAppReminder['status']) => {
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            sent: "bg-green-900/50 text-green-300",
            error: "bg-red-900/50 text-red-300",
        };
        const Icons = { pending: ClockIcon, sent: CheckCircleIcon, error: AlertTriangleIcon };
        const text = { pending: "Pendente", sent: "Enviado", error: "Erro" };
        const Icon = Icons[status];
        return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>
                <Icon className="w-3 h-3" />
                {text[status]}
            </span>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Agendamentos WhatsApp</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                 <div className="flex justify-between items-center mb-4">
                    <p className="text-gray-400">Monitore a fila de lembretes automáticos de comprovação.</p>
                     <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg w-fit">
                        {(['all', 'pending', 'sent', 'error'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                {{ 'all': 'Todos', 'pending': 'Pendentes', 'sent': 'Enviados', 'error': 'Erros' }[f]}
                            </button>
                        ))}
                    </div>
                </div>
                 {error && <p className="text-red-400 mb-4">{error}</p>}

                 <div className="overflow-x-auto">
                     {isLoading ? (
                        <div className="text-center py-10">Carregando...</div>
                     ) : filteredReminders.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">Nenhum agendamento encontrado com este filtro.</div>
                     ) : (
                        <table className="min-w-full divide-y divide-gray-700">
                             <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data Agendada</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredReminders.map(r => (
                                    <tr key={r.id}>
                                        <td className="px-4 py-3"><div className="font-medium text-white">{r.promoterName}</div><div className="text-xs text-gray-400">{r.promoterWhatsapp}</div></td>
                                        <td className="px-4 py-3 text-sm text-gray-300">{r.postCampaignName}</td>
                                        <td className="px-4 py-3 text-sm text-gray-300">{formatDate(r.sendAt)}</td>
                                        <td className="px-4 py-3">
                                            {getStatusBadge(r.status)}
                                            {r.status === 'error' && <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={r.errorMessage}>{r.errorMessage}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-medium">
                                            {r.status === 'pending' && (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleSendNow(r.id)} disabled={processingId === r.id} className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 disabled:opacity-50">Enviar Agora</button>
                                                    <button onClick={() => handleDelete(r.id)} disabled={processingId === r.id} className="px-3 py-1 bg-red-800 text-white rounded-md text-xs hover:bg-red-700 disabled:opacity-50">Cancelar</button>
                                                </div>
                                            )}
                                             {r.status === 'error' && (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleSendNow(r.id)} disabled={processingId === r.id} className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 disabled:opacity-50">Tentar Novamente</button>
                                                    <button onClick={() => handleDelete(r.id)} disabled={processingId === r.id} className="px-3 py-1 bg-red-800 text-white rounded-md text-xs hover:bg-red-700 disabled:opacity-50">Excluir</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     )}
                 </div>
            </div>
        </div>
    );
};

export default AdminWhatsAppReminders;