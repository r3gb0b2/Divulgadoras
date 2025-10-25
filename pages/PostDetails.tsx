import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment } from '../types';
import { getPostWithAssignments, updatePost, deletePost, sendPostReminder, sendSinglePostReminder, updateAssignment, acceptAllJustifications } from '../services/postService';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, PencilIcon, TrashIcon, UserPlusIcon, EnvelopeIcon, ChartBarIcon, MegaphoneIcon, CheckCircleIcon } from '../components/Icons';
import StorageMedia from '../components/StorageMedia';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { storage, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';


const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type AssignmentStatusFilter = 'all' | 'pending' | 'confirmed' | 'completed' | 'justified';

export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [filter, setFilter] = useState<AssignmentStatusFilter>('all');

    // Modals state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isChangeStatusModalOpen, setIsChangeStatusModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);

    const canManage = adminData?.role === 'admin' || adminData?.role === 'superadmin' || adminData?.role === 'poster';

    const fetchData = useCallback(async () => {
        if (!postId) {
            setError("ID da publicação não encontrado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const { post: postData, assignments: assignmentsData } = await getPostWithAssignments(postId);
            setPost(postData);
            setAssignments(assignmentsData.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
        } catch (err: any) {
            setError(err.message || 'Falha ao buscar detalhes da publicação.');
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const pendingJustificationsCount = useMemo(() => {
        return assignments.filter(a => a.justificationStatus === 'pending').length;
    }, [assignments]);
    
    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        
        let finalMediaUrl = updatedData.mediaUrl;
        if (post.type === 'image' && newMediaFile) {
            const fileExtension = newMediaFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = ref(storage, `posts-media/${fileName}`);
            await uploadBytes(storageRef, newMediaFile);
            finalMediaUrl = storageRef.fullPath;
        }

        const dataToSend = { ...updatedData, mediaUrl: finalMediaUrl };

        try {
            await updatePost(post.id, dataToSend);
            await fetchData();
        } catch(err: any) {
            setError(err.message || 'Falha ao salvar post.');
            // Re-throw to keep modal error state if needed
            throw err;
        }
    };

    const handleDeletePost = async () => {
        if (!post) return;
        if (window.confirm("Tem certeza que deseja excluir esta publicação e todas as suas tarefas? Esta ação não pode ser desfeita.")) {
            try {
                await deletePost(post.id);
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message || "Falha ao excluir.");
            }
        }
    };
    
    const handleGeneralReminder = async () => {
        if (!post) return;
        if (window.confirm("Isso enviará um e-mail de lembrete para TODAS as divulgadoras que confirmaram mas ainda não enviaram a comprovação. Deseja continuar?")) {
            setIsProcessing('general');
            try {
                // FIX: functions and httpsCallable were not defined. Added imports.
                const func = httpsCallable(functions, 'sendPostReminder');
                const result = await func({ postId: post.id });
                const data = result.data as { count: number, message: string };
                alert(data.message || `Lembretes enviados para ${data.count} divulgadoras.`);
                fetchData();
            } catch(err:any) {
                setError(err.message || 'Falha ao enviar lembretes.');
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleAcceptAllJustifications = async () => {
        if (!post || pendingJustificationsCount === 0) return;
        if (window.confirm(`Tem certeza que deseja aceitar todas as ${pendingJustificationsCount} justificativas pendentes para esta publicação?`)) {
            setIsProcessing('accept_all');
            try {
                const result = await acceptAllJustifications(post.id);
                alert(result.message || `${result.count} justificativas foram aceitas.`);
                await fetchData();
            } catch (err: any) {
                setError(err.message || 'Falha ao aceitar justificativas.');
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleSingleReminder = async (assignment: PostAssignment) => {
        setIsProcessing(assignment.id);
        try {
            await sendSinglePostReminder(assignment.id);
            alert(`Lembrete enviado para ${assignment.promoterName}.`);
            fetchData();
        } catch(err:any) {
            setError(err.message);
        } finally {
            setIsProcessing(null);
        }
    };
    
    const handleUpdateAssignment = async (assignmentId: string, data: Partial<PostAssignment>) => {
        try {
            const finalData = { ...data, actionTakenBy: adminData?.email };
            await updateAssignment(assignmentId, finalData);
            await fetchData();
        } catch(err) {
            throw err;
        }
    };


    const filteredAssignments = useMemo(() => {
        if (filter === 'all') return assignments;
        if (filter === 'completed') return assignments.filter(a => !!a.proofSubmittedAt);
        if (filter === 'justified') return assignments.filter(a => !!a.justification);
        if (filter === 'confirmed') return assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification);
        if (filter === 'pending') return assignments.filter(a => a.status === 'pending' && !a.justification);
        return [];
    }, [assignments, filter]);

    const stats = useMemo(() => {
        const total = assignments.length;
        const completed = assignments.filter(a => !!a.proofSubmittedAt).length;
        const justified = assignments.filter(a => !!a.justification).length;
        const confirmed = assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification).length;
        const pending = assignments.filter(a => a.status === 'pending' && !a.justification).length;
        return { total, completed, justified, confirmed, pending };
    }, [assignments]);

    if (isLoading) {
        return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    }

    if (error && !post) {
        return <div className="text-red-400 text-center py-10">{error}</div>;
    }

    if (!post) {
        return <div className="text-center py-10">Publicação não encontrada.</div>;
    }
    
    const filterButtons: { label: string; value: AssignmentStatusFilter; count: number }[] = [
        { label: 'Todas', value: 'all', count: stats.total },
        { label: 'Concluídas', value: 'completed', count: stats.completed },
        { label: 'Confirmadas', value: 'confirmed', count: stats.confirmed },
        { label: 'Pendentes', value: 'pending', count: stats.pending },
        { label: 'Com Justificativa', value: 'justified', count: stats.justified },
    ];

    const getStatusBadge = (assignment: PostAssignment) => {
        if (assignment.proofSubmittedAt) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">Concluído</span>;
        if (assignment.justification) {
            if (assignment.justificationStatus === 'accepted') return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-900/50 text-blue-300">Justificativa Aceita</span>;
            if (assignment.justificationStatus === 'rejected') return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-900/50 text-red-300">Justificativa Rejeitada</span>;
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Justificativa Pendente</span>;
        }
        if (assignment.status === 'confirmed') return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-900/50 text-indigo-300">Confirmado</span>;
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-700 text-gray-400">Pendente</span>;
    };


    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar para Publicações</span>
            </button>
            <div className="bg-secondary p-6 rounded-lg shadow-lg">
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">{post.campaignName}</h1>
                        {post.eventName && <p className="text-xl text-primary">{post.eventName}</p>}
                        <div className="mt-2 text-sm text-gray-400">
                            <p>Criado em: {formatDate(post.createdAt)}</p>
                            <p>Status: <span className={post.isActive ? 'text-green-400' : 'text-red-400'}>{post.isActive ? 'Ativo' : 'Inativo'}</span></p>
                        </div>
                    </div>
                     {canManage && (
                        <div className="flex flex-wrap gap-2 flex-shrink-0">
                            <button onClick={() => setIsEditModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"><PencilIcon className="w-4 h-4"/> Editar Conteúdo</button>
                            <button onClick={() => setIsAssignModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"><UserPlusIcon className="w-4 h-4"/> Atribuir a Mais</button>
                            <button onClick={handleDeletePost} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"><TrashIcon className="w-4 h-4"/> Excluir Post</button>
                        </div>
                    )}
                </div>

                <div className="mt-6 border-t border-gray-700 pt-4 space-y-4">
                     {(post.type === 'image' || post.type === 'video') && post.mediaUrl && (
                         <div className="max-w-sm">
                            <StorageMedia path={post.mediaUrl} type={post.type} className="w-full rounded-md" controls={post.type === 'video'}/>
                         </div>
                     )}
                     {post.type === 'text' && (
                         <div className="bg-dark/70 p-3 rounded-md"><pre className="text-gray-300 whitespace-pre-wrap font-sans">{post.textContent}</pre></div>
                     )}
                     <div>
                        <h3 className="font-semibold">Instruções:</h3>
                        <p className="text-gray-300 whitespace-pre-wrap">{post.instructions}</p>
                     </div>
                      {post.postLink && (
                        <div>
                            <h3 className="font-semibold">Link da Postagem:</h3>
                            <a href={post.postLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{post.postLink}</a>
                        </div>
                     )}
                </div>
            </div>

             <div className="mt-8 bg-secondary p-6 rounded-lg shadow-lg">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                    <h2 className="text-2xl font-bold">Tarefas das Divulgadoras ({assignments.length})</h2>
                    {canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                            {pendingJustificationsCount > 0 && (
                                <button onClick={handleAcceptAllJustifications} disabled={isProcessing === 'accept_all'} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-semibold disabled:opacity-50">
                                    <CheckCircleIcon className="w-5 h-5"/>
                                    {isProcessing === 'accept_all' ? 'Processando...' : `Aceitar Todas Justificativas (${pendingJustificationsCount})`}
                                </button>
                            )}
                            <button onClick={handleGeneralReminder} disabled={isProcessing === 'general'} className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-semibold disabled:opacity-50">
                                <MegaphoneIcon className="w-5 h-5"/>
                                {isProcessing === 'general' ? 'Enviando...' : 'Lembrete Geral'}
                            </button>
                        </div>
                    )}
                </div>
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
                 
                 <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg mb-4 w-fit overflow-x-auto">
                    {filterButtons.map(f => (
                         <button 
                            key={f.value} 
                            onClick={() => setFilter(f.value)} 
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${filter === f.value ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                        >
                            {f.label} ({f.count})
                        </button>
                    ))}
                 </div>
                 
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Divulgadora</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Comprovação / Justificativa</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredAssignments.map(assignment => (
                                <tr key={assignment.id} className="hover:bg-gray-700/40">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <p className="font-semibold text-white">{assignment.promoterName}</p>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {getStatusBadge(assignment)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-300">
                                        {assignment.proofImageUrls && assignment.proofImageUrls.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-gray-400">({formatDate(assignment.proofSubmittedAt)}):</p>
                                                {assignment.proofImageUrls.map((url, index) => (
                                                url === 'manual' ? 
                                                <div key={index} className="w-12 h-12 bg-gray-800 rounded-md flex items-center justify-center text-center text-xs text-gray-300">Manual</div>
                                                :
                                                <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                                        <img src={url} alt={`Prova ${index + 1}`} className="w-12 h-12 object-cover rounded-md border border-green-500" />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        {assignment.justification && (
                                            <div>
                                                <p className="text-xs text-gray-400">({formatDate(assignment.justificationSubmittedAt)}):</p>
                                                <p className="text-sm italic bg-gray-800/50 p-1 rounded">"{assignment.justification}"</p>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center gap-x-4">
                                            <button onClick={() => { setSelectedAssignment(assignment); setIsStatsModalOpen(true); }} className="flex items-center gap-1 text-blue-400 hover:text-blue-300"><ChartBarIcon className="w-4 h-4" /> <span className="hidden sm:inline">Estatísticas</span></button>
                                            {assignment.status === 'confirmed' && !assignment.proofSubmittedAt && !assignment.justification && (
                                                <button onClick={() => handleSingleReminder(assignment)} disabled={isProcessing === assignment.id} className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300 disabled:opacity-50">
                                                    <EnvelopeIcon className="w-4 h-4" /> {isProcessing === assignment.id ? '...' : <span className="hidden sm:inline">Lembrete</span>}
                                                </button>
                                            )}
                                            <button onClick={() => { setSelectedAssignment(assignment); setIsChangeStatusModalOpen(true); }} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"><PencilIcon className="w-4 h-4" /> <span className="hidden sm:inline">Alterar</span></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredAssignments.length === 0 && (
                        <p className="text-gray-400 text-center py-8">Nenhuma tarefa encontrada com este filtro.</p>
                    )}
                 </div>
            </div>

            {/* Modals */}
            {canManage && (
                <>
                    <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost}/>
                    <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData}/>
                    <ChangeAssignmentStatusModal 
                        isOpen={isChangeStatusModalOpen}
                        onClose={() => setIsChangeStatusModalOpen(false)}
                        assignment={selectedAssignment}
                        onSave={handleUpdateAssignment}
                    />
                </>
            )}
            <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedAssignment}/>
        </div>
    );
};