import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllWhatsAppReminders, deleteWhatsAppReminder } from '../services/messageService';
import { WhatsAppReminder, Timestamp } from '../types';
import { ArrowLeftIcon, TrashIcon, WhatsAppIcon } from '../components/Icons';

const AdminWhatsAppReminders: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [reminders, setReminders] = useState<WhatsAppReminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'sent' | 'error'>('all');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getAllWhatsAppReminders();
            setReminders(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar agendamentos.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (adminData?.role !== 'superadmin') {
            navigate('/admin');
            return;
        }
        fetchData();
    }, [adminData, navigate, fetchData]);
    
    const handleDelete = async (id: string) => {
        if (!window.confirm("Tem certeza que deseja deletar este agendamento?")) return;
        setProcessingId(id);
        try {
            await deleteWhatsAppReminder(id);
            setReminders(prev => prev.filter(r => r.id !== id));
        } catch (err: any) {
            setError(err.message || "Falha ao deletar.");
        } finally {
            setProcessingId(null);
        }
    };

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
        const text = { pending: "Pendente", sent: "Enviado", error: "Erro" };
        return <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    const filteredReminders = useMemo(() => {
        if (filter === 'all') return reminders;
        return reminders.filter(r => r.status === filter);
    }, [reminders, filter]);

    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        }
        if (error) {
            return <p className="text-red-400 text-center">{error}</p>;
        }
        if (filteredReminders.length === 0) {
            return <p className="text-gray-400 text-center py-8">Nenhum agendamento encontrado com este filtro.</p>;
        }
        return (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Agendado Para</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filteredReminders.map(req => (
                            <tr key={req.id} className="hover:bg-gray-700/40">
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <p className="font-medium text-white">{req.promoterName}</p>
                                    <p className="text-sm text-gray-400">{req.promoterWhatsapp}</p>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{req.postCampaignName}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{formatDate(req.sendAt as Timestamp)}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    {getStatusBadge(req.status)}
                                    {req.status === 'error' && <p className="text-xs text-red-400 mt-1 truncate" title={(req as any).error}>{(req as any).error}</p>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => handleDelete(req.id)} disabled={processingId === req.id} className="text-red-400 hover:text-red-300 disabled:opacity-50">
                                        <TrashIcon className="w-5 h-5"/>
                                    </button>
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
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <WhatsAppIcon className="w-8 h-8 text-green-500" />
                    Agendamentos WhatsApp
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <p className="text-gray-400">
                        Acompanhe o status dos lembretes de comprovação enviados via WhatsApp.
                    </p>
                    <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                        {(['all', 'pending', 'sent', 'error'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                {{'all': 'Todos', 'pending': 'Pendentes', 'sent': 'Enviados', 'error': 'Erros'}[f]}
                            </button>
                        ))}
                    </div>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminWhatsAppReminders;
