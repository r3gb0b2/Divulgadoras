import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Post, PostAssignment, Promoter, Timestamp } from '../types';
import { getPostWithAssignments, sendPostReminder, sendSinglePostReminder, updatePost, deletePost, acceptAllJustifications, updateAssignment } from '../services/postService';
import { getPromotersByIds } from '../services/promoterService';
import { ArrowLeftIcon, MegaphoneIcon, PencilIcon, TrashIcon, UserPlusIcon, CheckCircleIcon } from '../components/Icons';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import StorageMedia from '../components/StorageMedia';
import firebase from 'firebase/compat/app';

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR');
};

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [promotersMap, setPromotersMap] = useState<Map<string, Promoter>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingAction, setProcessingAction] = useState<string | null>(null);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);

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
            setAssignments(assignmentsData);

            const promoterIds = [...new Set(assignmentsData.map(a => a.promoterId))];
            if (promoterIds.length > 0) {
                const promoters = await getPromotersByIds(promoterIds);
                setPromotersMap(new Map(promoters.map(p => [p.id, p])));
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar detalhes da publicação.');
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSendAllReminders = async () => {
        if (!post || !window.confirm("Enviar lembrete para todas as divulgadoras que confirmaram mas ainda não enviaram a comprovação?")) return;
        setProcessingAction('sendAllReminders');
        setError('');
        try {
            const result = await sendPostReminder(post.id);
            alert(result.message);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar lembretes.');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleSendSingleReminder = async (assignmentId: string) => {
        if (!post) return;
        setProcessingAction(assignmentId);
        setError('');
        try {
            const result = await sendSinglePostReminder(assignmentId);
            alert(result.message);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar lembrete.');
        } finally {
            setProcessingAction(null);
        }
    };
    
    const handleAcceptAllJustifications = async () => {
        if (!post || !window.confirm("Aceitar todas as justificativas pendentes para esta publicação?")) return;
        setProcessingAction('acceptAllJustifications');
        setError('');
        try {
            const result = await acceptAllJustifications(post.id);
            alert(result.message);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao aceitar justificativas.');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        setProcessingAction('savePost');
        let finalUpdatedData: Partial<Post> = { ...updatedData };

        if (newMediaFile) {
            const fileExtension = newMediaFile.name.split('.').pop();
            const fileName = `posts-media/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = firebase.storage().ref(fileName);
            await storageRef.put(newMediaFile);
            const downloadURL = await storageRef.getDownloadURL();
            finalUpdatedData.mediaUrl = downloadURL;
        }

        try {
            await updatePost(post.id, finalUpdatedData);
            await fetchData();
            alert("Publicação atualizada com sucesso. As alterações estão sendo aplicadas a todas as tarefas.");
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar a publicação.');
            throw err;
        } finally {
            setProcessingAction(null);
        }
    };

    const handleDeletePost = async () => {
        if (!post || !window.confirm("Tem certeza que deseja DELETAR esta publicação e todas as suas tarefas associadas? Esta ação é irreversível.")) return;
        setProcessingAction('deletePost');
        try {
            await deletePost(post.id);
            alert("Publicação deletada com sucesso.");
            navigate('/admin/posts');
        } catch (err: any) {
            setError(err.message || 'Falha ao deletar a publicação.');
            setProcessingAction(null);
        }
    };

    const handleSaveAssignmentStatus = async (assignmentId: string, data: Partial<PostAssignment>) => {
        setProcessingAction(`status-${assignmentId}`);
        try {
            await updateAssignment(assignmentId, data);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar status da tarefa.');
            throw err;
        } finally {
            setProcessingAction(null);
        }
    };
    
    const openStatusModal = (assignment: PostAssignment) => {
        setSelectedAssignment(assignment);
        setIsStatusModalOpen(true);
    };

    const stats = useMemo(() => {
        const total = assignments.length;
        const pending = assignments.filter(a => a.status === 'pending').length;
        const confirmed = assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification).length;
        const completed = assignments.filter(a => !!a.proofSubmittedAt).length;
        const justifications = assignments.filter(a => !!a.justification).length;
        const pendingJustifications = assignments.filter(a => a.justificationStatus === 'pending').length;
        return { total, pending, confirmed, completed, justifications, pendingJustifications };
    }, [assignments]);
    
    const getStatusBadge = (assignment: PostAssignment) => {
        const now = new Date();

        if (assignment.proofSubmittedAt) return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Comprovação Enviada</span>;
        if (assignment.justification) {
            if (assignment.justificationStatus === 'accepted') return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-900/50 text-blue-300">Justificativa Aceita</span>;
            if (assignment.justificationStatus === 'rejected') return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300">Justificativa Rejeitada</span>;
            return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Justificativa Pendente</span>;
        }
        if (assignment.status === 'confirmed') {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if(confirmedAt && !assignment.post.allowLateSubmissions){
                 const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                 if(now > deadline) return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300">Prazo Expirado</span>;
            }
            return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-teal-900/50 text-teal-300">Confirmado</span>;
        }
        
        const expiresAt = toDateSafe(post?.expiresAt);
        if (expiresAt && now > expiresAt) {
            return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-400">Expirado (Não Confirmou)</span>;
        }

        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-400">Pendente</span>;
    };


    if (isLoading) return <div className="text-center py-10">Carregando...</div>;
    if (error && !post) return <div className="text-red-400 text-center py-10">{error}</div>;
    if (!post) return <div className="text-center py-10">Publicação não encontrada.</div>;

    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="md:w-1/3">
                        <StorageMedia path={post.mediaUrl || post.googleDriveUrl || ''} type={post.type} className="w-full rounded-lg mb-4" />
                        <h1 className="text-2xl font-bold">{post.campaignName}</h1>
                        {post.eventName && <p className="text-lg text-primary">{post.eventName}</p>}
                        <div className="mt-4 space-y-2 text-sm">
                            <h3 className="font-semibold">Instruções:</h3>
                            <p className="whitespace-pre-wrap text-gray-300">{post.instructions}</p>
                        </div>
                    </div>
                    <div className="md:w-2/3">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center mb-4">
                            <div className="bg-dark/70 p-3 rounded-lg"><h4 className="text-xs text-gray-400">Total</h4><p className="text-2xl font-bold">{stats.total}</p></div>
                            <div className="bg-dark/70 p-3 rounded-lg"><h4 className="text-xs text-gray-400">Pendentes</h4><p className="text-2xl font-bold">{stats.pending}</p></div>
                            <div className="bg-dark/70 p-3 rounded-lg"><h4 className="text-xs text-gray-400">Confirmadas</h4><p className="text-2xl font-bold">{stats.confirmed}</p></div>
                            <div className="bg-dark/70 p-3 rounded-lg"><h4 className="text-xs text-gray-400">Concluídas</h4><p className="text-2xl font-bold">{stats.completed}</p></div>
                            <div className="bg-dark/70 p-3 rounded-lg"><h4 className="text-xs text-gray-400">Justificativas</h4><p className="text-2xl font-bold">{stats.justifications}</p></div>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                            <button onClick={() => setIsEditModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 rounded-md text-sm"><PencilIcon className="w-4 h-4" />Editar Conteúdo</button>
                            <button onClick={() => setIsAssignModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 rounded-md text-sm"><UserPlusIcon className="w-4 h-4" />Atribuir Mais</button>
                            <button onClick={handleSendAllReminders} disabled={processingAction === 'sendAllReminders'} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-md text-sm"><MegaphoneIcon className="w-4 h-4" />Lembrar Todos</button>
                            {stats.pendingJustifications > 0 && 
                                <button onClick={handleAcceptAllJustifications} disabled={processingAction === 'acceptAllJustifications'} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 rounded-md text-sm"><CheckCircleIcon className="w-4 h-4" />Aceitar Justificativas ({stats.pendingJustifications})</button>}
                            <button onClick={handleDeletePost} disabled={!!processingAction} className="flex items-center gap-2 px-3 py-1.5 bg-red-800 rounded-md text-sm"><TrashIcon className="w-4 h-4" />Deletar Post</button>
                        </div>
                         {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
                        
                        <div className="overflow-x-auto max-h-[60vh]">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-800 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Divulgadora</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Data</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-300">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {assignments.map(a => {
                                        const promoterInGroup = promotersMap.get(a.promoterId)?.hasJoinedGroup;
                                        return (
                                            <tr key={a.id} className="hover:bg-gray-700/50">
                                                <td className="px-4 py-2 whitespace-nowrap">
                                                    <p className={`font-medium ${promoterInGroup ? 'text-green-400' : ''}`}>{a.promoterName}</p>
                                                    <p className="text-xs text-gray-400">{a.promoterEmail}</p>
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap">{getStatusBadge(a)}</td>
                                                <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">
                                                    {a.proofSubmittedAt ? formatDate(a.proofSubmittedAt) : (a.confirmedAt ? formatDate(a.confirmedAt) : 'N/A')}
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                                                    {a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification && (
                                                        <button onClick={() => handleSendSingleReminder(a.id)} disabled={!!processingAction} className="text-blue-400 hover:text-blue-300 mr-4">Lembrar</button>
                                                    )}
                                                    <button onClick={() => openStatusModal(a)} disabled={!!processingAction} className="text-indigo-400 hover:text-indigo-300">Gerenciar</button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <ChangeAssignmentStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} assignment={selectedAssignment} onSave={handleSaveAssignmentStatus} />
        </div>
    );
};
