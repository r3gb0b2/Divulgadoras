import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getScheduledPosts, updateScheduledPost, deleteScheduledPost } from '../services/postService';
import { ScheduledPost } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const timestampToDateTimeLocal = (ts: any): { date: string, time: string } => {
    if (!ts) return { date: '', time: '' };
    try {
        let d: Date;
        if (typeof ts.toDate === 'function') {
            d = ts.toDate();
        } else if (ts.seconds) {
            d = new Date(ts.seconds * 1000);
        } else {
            d = new Date(ts);
        }

        if (isNaN(d.getTime())) {
            return { date: '', time: '' };
        }
        
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - tzOffset);
        const date = localDate.toISOString().split('T')[0];
        const time = d.toTimeString().split(' ')[0].substring(0, 5);
        return { date, time };
    } catch (e) {
        console.error("Failed to parse timestamp:", ts, e);
        return { date: '', time: '' };
    }
};

const formatScheduledDate = (ts: any): string => {
    if (!ts) return "Não agendado";
    try {
        let date: Date;
        if (typeof ts.toDate === 'function') {
            date = ts.toDate();
        } else if (ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else {
            date = new Date(ts);
        }

        if (isNaN(date.getTime())) {
            return "Data inválida";
        }

        return date.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        console.error("Failed to format date:", ts, e);
        return "Erro na data";
    }
};


const EditScheduleModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    post: ScheduledPost,
    onSave: (id: string, newTimestamp: Timestamp) => Promise<void>
}> = ({ isOpen, onClose, post, onSave }) => {
    const { date, time } = timestampToDateTimeLocal(post.scheduledAt);
    const [scheduleDate, setScheduleDate] = useState(date);
    const [scheduleTime, setScheduleTime] = useState(time);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const { date, time } = timestampToDateTimeLocal(post.scheduledAt);
        setScheduleDate(date);
        setScheduleTime(time);
        setError('');
    }, [post, isOpen]);
    
    if (!isOpen) return null;

    const handleSave = async () => {
        setError('');
        if (!scheduleDate || !scheduleTime) {
            setError('Data e hora são obrigatórias.');
            return;
        }
        const newDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
        if (newDateTime < new Date()) {
            setError('A data de agendamento não pode ser no passado.');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(post.id, Timestamp.fromDate(newDateTime));
            onClose();
        } catch(err: any) {
            setError(err.message || 'Falha ao salvar.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white mb-4">Editar Agendamento</h2>
                <p className="text-sm text-gray-400 mb-4">Alterar data e hora para: <strong className="text-primary">{post.postData.campaignName}</strong></p>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                <div className="flex gap-4">
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};


const AdminSchedulePage: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const data = await getScheduledPosts(selectedOrgId);
            setScheduledPosts(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar agendamentos.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const handleSaveSchedule = async (id: string, newTimestamp: Timestamp) => {
        try {
            await updateScheduledPost(id, { scheduledAt: newTimestamp });
            await fetchData();
        } catch (err) {
            throw err; // Re-throw to show error in modal
        }
    };
    
    const handleCancel = async (id: string) => {
        if (window.confirm("Tem certeza que deseja cancelar este agendamento? A publicação não será enviada.")) {
            try {
                await deleteScheduledPost(id);
                await fetchData();
            } catch (err: any) {
                setError(err.message || "Falha ao cancelar agendamento.");
            }
        }
    };

    const getStatusBadge = (status: ScheduledPost['status']) => {
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
                <h1 className="text-3xl font-bold">Publicações Agendadas</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {error && <p className="text-red-400 mb-4">{error}</p>}
                {isLoading ? <p className="text-center py-8">Carregando...</p> : (
                    <div className="space-y-4">
                        {scheduledPosts.length === 0 ? (
                            <p className="text-gray-400 text-center py-8">Nenhuma publicação agendada.</p>
                        ) : (
                            scheduledPosts.map(post => (
                                <div key={post.id} className="bg-dark/70 p-4 rounded-lg">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                                        <div>
                                            <p className="font-bold text-lg text-primary">{post.postData.campaignName}</p>
                                            <p className="text-sm text-gray-300">
                                                Agendado para: <span className="font-semibold">{formatScheduledDate(post.scheduledAt)}</span>
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                Para {post.assignedPromoters.length} divulgadora(s)
                                            </p>
                                        </div>
                                        <div className="flex-shrink-0">{getStatusBadge(post.status)}</div>
                                    </div>
                                    {post.status === 'error' && post.error && (
                                        <p className="text-xs text-red-300 bg-red-900/30 p-2 rounded mt-2">Motivo do erro: {post.error}</p>
                                    )}
                                    {post.status === 'pending' && (
                                        <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap gap-2 justify-end text-sm">
                                            <button onClick={() => setEditingPost(post)} className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Editar Horário</button>
                                            <button onClick={() => handleCancel(post.id)} className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700">Cancelar</button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
            {editingPost && (
                <EditScheduleModal 
                    isOpen={!!editingPost}
                    onClose={() => setEditingPost(null)}
                    post={editingPost}
                    onSave={handleSaveSchedule}
                />
            )}
        </div>
    );
};

export default AdminSchedulePage;