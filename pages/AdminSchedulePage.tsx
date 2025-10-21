import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getScheduledPosts, updateScheduledPost, deleteScheduledPost } from '../services/postService';
import { ScheduledPost } from '../types';
import { ArrowLeftIcon, ClockIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const EditScheduleModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    post: ScheduledPost;
    onSave: (id: string, newDate: Timestamp) => Promise<void>;
}> = ({ isOpen, onClose, post, onSave }) => {
    
    const initialDate = post.scheduledAt instanceof Timestamp ? post.scheduledAt.toDate() : new Date();
    const [scheduleDate, setScheduleDate] = useState(initialDate.toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = useState(initialDate.toTimeString().substring(0, 5));
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (post && post.scheduledAt instanceof Timestamp) {
            const date = post.scheduledAt.toDate();
            setScheduleDate(date.toISOString().split('T')[0]);
            setScheduleTime(date.toTimeString().substring(0, 5));
        }
    }, [post]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const [hours, minutes] = scheduleTime.split(':').map(Number);
            const newDateTime = new Date(scheduleDate);
            newDateTime.setHours(hours, minutes);
            await onSave(post.id, Timestamp.fromDate(newDateTime));
            onClose();
        } catch (error) {
            console.error(error);
            alert('Falha ao salvar. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-4">Editar Agendamento</h2>
                <div className="space-y-4">
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" />
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" />
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 rounded">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50">
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
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
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
        try {
            const scheduled = await getScheduledPosts(selectedOrgId);
            setPosts(scheduled);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleUpdateSchedule = async (id: string, newDate: Timestamp) => {
        await updateScheduledPost(id, { scheduledAt: newDate });
        await fetchData();
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja cancelar este agendamento? A publicação não será enviada.")) {
            await deleteScheduledPost(id);
            await fetchData();
        }
    };
    
    const formatDate = (ts: any) => ts instanceof Timestamp ? ts.toDate().toLocaleString('pt-BR') : 'N/A';
    
    const getStatusBadge = (status: 'scheduled' | 'sent' | 'error') => {
        const styles = {
            scheduled: 'bg-blue-900/50 text-blue-300',
            sent: 'bg-green-900/50 text-green-300',
            error: 'bg-red-900/50 text-red-300',
        };
        const text = { scheduled: 'Agendado', sent: 'Enviado', error: 'Erro' };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3"><ClockIcon className="w-8 h-8" />Publicações Agendadas</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {isLoading && <p>Carregando...</p>}
                {error && <p className="text-red-400">{error}</p>}
                {!isLoading && posts.length === 0 && <p className="text-gray-400">Nenhuma publicação agendada.</p>}
                <div className="space-y-4">
                    {posts.map(post => (
                        <div key={post.id} className="bg-dark/70 p-4 rounded-lg">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                    <p className="text-sm text-gray-300">Agendado para: <span className="font-semibold">{formatDate(post.scheduledAt)}</span></p>
                                    <p className="text-xs text-gray-400">Tipo: {post.type}</p>
                                </div>
                                {getStatusBadge(post.status)}
                            </div>
                            {post.status === 'error' && <p className="text-xs text-red-300 mt-2">Motivo: {post.errorMessage}</p>}
                            {post.status === 'scheduled' && (
                                <div className="mt-3 pt-3 border-t border-gray-700 flex gap-2 justify-end">
                                    <button onClick={() => setEditingPost(post)} className="px-3 py-1 bg-indigo-600 text-white text-sm rounded">Editar</button>
                                    <button onClick={() => handleDelete(post.id)} className="px-3 py-1 bg-red-600 text-white text-sm rounded">Cancelar</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {editingPost && <EditScheduleModal isOpen={!!editingPost} onClose={() => setEditingPost(null)} post={editingPost} onSave={handleUpdateSchedule} />}
        </div>
    );
};

export default AdminSchedulePage;