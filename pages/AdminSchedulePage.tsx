import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getScheduledPosts, updateScheduledPost, deleteScheduledPost } from '../services/postService';
import { ScheduledPost } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

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
            hour: '2-digit', minute: '2-digit',
            timeZoneName: 'short',
        });
    } catch (e) {
        console.error("Failed to format date:", ts, e);
        return "Erro na data";
    }
};


const AdminSchedulePage: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

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
                                            <button onClick={() => navigate(`/admin/posts/new?editScheduled=${post.id}`)} className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Editar Agendamento</button>
                                            <button onClick={() => handleCancel(post.id)} className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700">Cancelar</button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSchedulePage;