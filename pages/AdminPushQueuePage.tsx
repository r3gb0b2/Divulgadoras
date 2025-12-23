
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { firestore } from '../firebase/config';
import { sendPushReminderImmediately } from '../services/messageService';
import { PushReminder, Timestamp } from '../types';
import { ArrowLeftIcon, FaceIdIcon, RefreshIcon, ClockIcon } from '../components/Icons';

const AdminPushQueuePage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [reminders, setReminders] = useState<PushReminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [error, setError] = useState('');

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const snapshot = await firestore.collection('pushReminders')
                .orderBy('scheduledFor', 'desc')
                .limit(100)
                .get();
            
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PushReminder));
            setReminders(data);
        } catch (err: any) {
            setError("Erro ao carregar fila. Verifique se o índice composto foi criado.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (adminData?.role === 'superadmin') {
            fetchQueue();
        }
    }, [adminData, fetchQueue]);

    const handleSendNow = async (reminderId: string) => {
        if (!window.confirm("Deseja disparar esta notificação imediatamente?")) return;
        setIsProcessing(reminderId);
        try {
            await sendPushReminderImmediately(reminderId);
            await fetchQueue();
            alert("Enviado com sucesso!");
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            sent: "bg-green-900/50 text-green-300",
            error: "bg-red-900/50 text-red-300"
        };
        const label = { pending: "Aguardando", sent: "Enviado", error: "Falhou" };
        return <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${styles[status as keyof typeof styles]}`}>{label[status as keyof typeof label] || status}</span>;
    };

    const formatDate = (ts: any) => {
        if (!ts) return '-';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('pt-BR');
    };

    if (adminData?.role !== 'superadmin') return <div className="p-10 text-center text-red-500 font-bold">Acesso Negado</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <ClockIcon className="w-8 h-8 text-primary" />
                    Fila de Lembretes Push
                </h1>
                <div className="flex gap-2">
                    <button onClick={fetchQueue} className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                        <ArrowLeftIcon className="w-4 h-4" /> Voltar
                    </button>
                </div>
            </div>

            <div className="bg-secondary rounded-xl shadow-lg border border-gray-700 overflow-hidden">
                <div className="p-4 bg-gray-800/50 border-b border-gray-700">
                    <p className="text-xs text-gray-400">Exibindo os últimos 100 agendamentos (Lembretes de 6h solicitados pelas divulgadoras).</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-dark/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Divulgadora</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Agendado Para</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                            {isLoading && reminders.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-20 text-gray-500">Carregando fila de disparos...</td></tr>
                            ) : reminders.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-20 text-gray-500">Nenhum lembrete na fila.</td></tr>
                            ) : (
                                reminders.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400"><FaceIdIcon className="w-5 h-5" /></div>
                                                <div>
                                                    <p className="text-sm font-bold text-white">ID: {r.promoterId.substring(0,8)}...</p>
                                                    <p className="text-[10px] text-gray-500 font-mono truncate max-w-[200px]">{r.fcmToken.substring(0,30)}...</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-gray-300 font-medium">{formatDate(r.scheduledFor)}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(r.status)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {r.status === 'pending' && (
                                                <button 
                                                    onClick={() => handleSendNow(r.id)} 
                                                    disabled={isProcessing === r.id}
                                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded-lg disabled:opacity-50 transition-all"
                                                >
                                                    {isProcessing === r.id ? 'Enviando...' : 'Disparar Agora'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {error && <p className="mt-4 text-red-400 text-center font-bold">{error}</p>}
        </div>
    );
};

export default AdminPushQueuePage;
