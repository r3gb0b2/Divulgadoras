
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWhatsAppReminders, deleteWhatsAppReminder, sendWhatsAppReminderImmediately } from '../services/messageService';
import { WhatsAppReminder, Timestamp } from '../types';
import { ArrowLeftIcon, TrashIcon, WhatsAppIcon, RefreshIcon } from '../components/Icons';

const AdminWhatsAppReminders: React.FC = () => {
    const navigate = useNavigate();
    const [reminders, setReminders] = useState<WhatsAppReminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'sent' | 'error'>('all');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getWhatsAppReminders();
            setReminders(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDelete = async (id: string) => {
        if (!window.confirm("Tem certeza que deseja excluir este agendamento?")) return;
        setProcessingId(id);
        try {
            await deleteWhatsAppReminder(id);
            setReminders(prev => prev.filter(r => r.id !== id));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleSendNow = async (id: string) => {
        if (!window.confirm("Enviar este lembrete agora?")) return;
        setProcessingId(id);
        try {
            await sendWhatsAppReminderImmediately(id);
            alert("Lembrete enviado com sucesso!");
            fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const filteredReminders = reminders.filter(r => filterStatus === 'all' || r.status === filterStatus);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('pt-BR');
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded text-xs font-bold">Pendente</span>;
            case 'sent': return <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded text-xs font-bold">Enviado</span>;
            case 'error': return <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs font-bold">Erro</span>;
            default: return <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs">{status}</span>;
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <WhatsAppIcon className="w-8 h-8 text-green-500" />
                    Fila de Lembretes WhatsApp
                </h1>
                <div className="flex gap-2">
                    <button onClick={fetchData} className="p-2 bg-gray-700 text-white rounded-md hover:bg-gray-600"><RefreshIcon className="w-5 h-5" /></button>
                    <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                        <ArrowLeftIcon className="w-4 h-4" />
                        <span>Voltar</span>
                    </button>
                </div>
            </div>

            <div className="bg-secondary p-6 rounded-lg shadow-lg">
                <div className="flex gap-2 mb-4 overflow-x-auto">
                    {(['all', 'pending', 'sent', 'error'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${filterStatus === status ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            {{ all: 'Todos', pending: 'Pendentes', sent: 'Enviados', error: 'Com Erro' }[status]}
                        </button>
                    ))}
                </div>

                {isLoading ? (
                    <div className="text-center py-10">Carregando...</div>
                ) : filteredReminders.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">Nenhum lembrete encontrado.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Agendado Para</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredReminders.map(reminder => (
                                    <tr key={reminder.id} className="hover:bg-gray-700/40">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {getStatusBadge(reminder.status)}
                                            {reminder.status === 'error' && (
                                                <div className="text-xs text-red-400 mt-1 max-w-xs truncate" title={reminder.error as string}>
                                                    {reminder.error as string}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="font-medium text-white">{reminder.promoterName}</div>
                                            <div className="text-xs text-gray-400">{reminder.promoterWhatsapp}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                            {reminder.postCampaignName}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                            {formatDate(reminder.sendAt)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end gap-2">
                                                {reminder.status === 'pending' && (
                                                    <button
                                                        onClick={() => handleSendNow(reminder.id)}
                                                        disabled={processingId === reminder.id}
                                                        className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
                                                        title="Enviar Agora"
                                                    >
                                                        {processingId === reminder.id ? '...' : <WhatsAppIcon className="w-5 h-5" />}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(reminder.id)}
                                                    disabled={processingId === reminder.id}
                                                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                                                    title="Excluir"
                                                >
                                                    <TrashIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminWhatsAppReminders;
