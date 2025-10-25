import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getPostWithAssignments, deletePost, updatePost, sendPostReminder, sendSinglePostReminder, acceptAllJustifications, updateAssignment } from '../services/postService';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon, MegaphoneIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import StorageMedia from '../components/StorageMedia';
import AssignPostModal from '../components/AssignPostModal';
import EditPostModal from '../components/EditPostModal';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import { storage } from '../firebase/config';
import { ref, uploadBytes } from 'firebase/storage';


// Helper to format date
const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR');
};


export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal states
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);

    const canManage = adminData?.role === 'admin' || adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!postId) return;
        setIsLoading(true);
        setError('');
        try {
            const { post: postData, assignments: assignmentsData } = await getPostWithAssignments(postId);
            setPost(postData);
            setAssignments(assignmentsData.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredAssignments = useMemo(() => {
        if (!searchQuery) return assignments;
        const lowerQuery = searchQuery.toLowerCase();
        return assignments.filter(a => a.promoterName.toLowerCase().includes(lowerQuery) || a.promoterEmail.toLowerCase().includes(lowerQuery));
    }, [assignments, searchQuery]);

    const handleDelete = async () => {
        if (!post) return;
        if (window.confirm("Tem certeza que deseja excluir esta publicação e todas as suas tarefas? Esta ação não pode ser desfeita.")) {
            setIsProcessing('delete');
            try {
                await deletePost(post.id);
                alert("Publicação excluída com sucesso.");
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleUpdatePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;

        let finalUpdateData = { ...updatedData };

        if (post.type === 'image' && newMediaFile) {
            const fileExtension = newMediaFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = ref(storage, `posts-media/${fileName}`);
            await uploadBytes(storageRef, newMediaFile);
            finalUpdateData.mediaUrl = storageRef.fullPath;
        }

        try {
            await updatePost(post.id, finalUpdateData);
            await fetchData();
            setIsEditModalOpen(false);
        } catch (err: any) {
            setError(err.message || "Falha ao atualizar a publicação.");
            throw err;
        }
    };
    
    const handleSendAllReminders = async () => {
        if (!post) return;
        if (window.confirm("Isso enviará um lembrete para todas as divulgadoras que confirmaram mas ainda não enviaram a comprovação. Deseja continuar?")) {
            setIsProcessing('reminders');
            try {
                const result = await sendPostReminder(post.id);
                alert(result.message);
                await fetchData();
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleSendSingleReminder = async (assignmentId: string) => {
        setIsProcessing(`reminder-${assignmentId}`);
        try {
            const result = await sendSinglePostReminder(assignmentId);
            alert(result.message);
            await fetchData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(null);
        }
    };
    
    const handleAcceptAllJustifications = async () => {
        if (!post) return;
        if (window.confirm("Tem certeza que deseja aceitar todas as justificativas pendentes para esta publicação?")) {
            setIsProcessing('accept_justifications');
            try {
                const result = await acceptAllJustifications(post.id);
                alert(result.message);
                await fetchData();
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleSaveAssignmentStatus = async (assignmentId: string, data: Partial<PostAssignment>) => {
        try {
            await updateAssignment(assignmentId, data);
            await fetchData();
            setIsStatusModalOpen(false);
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar status.');
            throw err; // Re-throw to show error in modal
        }
    };

    const openStatsModal = (assignment: PostAssignment) => {
        setSelectedAssignment(assignment);
        setIsStatsModalOpen(true);
    };
    
     const openStatusModal = (assignment: PostAssignment) => {
        setSelectedAssignment(assignment);
        setIsStatusModalOpen(true);
    };

    const stats = useMemo(() => {
        const confirmed = assignments.filter(a => a.status === 'confirmed').length;
        const proofSubmitted = assignments.filter(a => a.proofSubmittedAt).length;
        const justifications = assignments.filter(a => a.justification).length;
        const pendingJustifications = assignments.filter(a => a.justificationStatus === 'pending').length;
        return { total: assignments.length, confirmed, proofSubmitted, justifications, pendingJustifications };
    }, [assignments]);

    if (isLoading) return <div className="text-center py-10">Carregando detalhes...</div>;
    if (error && !post) return <div className="text-red-400 text-center py-10">{error}</div>;
    if (!post) return <div className="text-center py-10">Publicação não encontrada.</div>;
    
    const getStatusBadge = (a: PostAssignment) => {
        if (a.proofSubmittedAt) return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900/50 text-blue-300">Comprovado</span>
        if (a.status === 'confirmed') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-300">Confirmado</span>
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
    };

    const getJustificationBadge = (a: PostAssignment) => {
        if (!a.justification) return null;
        if (a.justificationStatus === 'accepted') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-300">Aceita</span>
        if (a.justificationStatus === 'rejected') return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/50 text-red-300">Rejeitada</span>
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
    }
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar para Posts
                </button>
            </div>
            
            {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}

            {/* Post Details Section */}
            <div className="bg-secondary p-6 rounded-lg shadow-lg mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1">
                        <StorageMedia path={post.mediaUrl || ''} type={post.type} className="w-full h-auto object-cover rounded-md" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                        <h1 className="text-3xl font-bold text-white">{post.campaignName}</h1>
                        {post.eventName && <h2 className="text-xl font-semibold text-primary -mt-2">{post.eventName}</h2>}
                        <p className="text-sm text-gray-400">Criado em: {formatDate(post.createdAt)} por {post.createdByEmail}</p>
                        <div className="bg-dark/70 p-3 rounded-md">
                            <h3 className="font-semibold mb-1">Instruções:</h3>
                            <p className="text-sm whitespace-pre-wrap">{post.instructions}</p>
                        </div>
                        {canManage && (
                             <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-700">
                                <button onClick={() => setIsEditModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm">Editar Conteúdo</button>
                                <button onClick={handleDelete} disabled={isProcessing === 'delete'} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm disabled:opacity-50">{isProcessing === 'delete' ? 'Excluindo...' : 'Excluir Post'}</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Assignments Section */}
            <div className="bg-secondary p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Tarefas ({assignments.length})</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 text-center">
                    <div className="bg-dark/70 p-3 rounded-lg"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-gray-400">Total</div></div>
                    <div className="bg-dark/70 p-3 rounded-lg"><div className="text-2xl font-bold text-yellow-400">{stats.total - stats.confirmed}</div><div className="text-xs text-gray-400">Pendentes</div></div>
                    <div className="bg-dark/70 p-3 rounded-lg"><div className="text-2xl font-bold text-green-400">{stats.confirmed}</div><div className="text-xs text-gray-400">Confirmados</div></div>
                    <div className="bg-dark/70 p-3 rounded-lg"><div className="text-2xl font-bold text-blue-400">{stats.proofSubmitted}</div><div className="text-xs text-gray-400">Comprovados</div></div>
                    <div className="bg-dark/70 p-3 rounded-lg"><div className="text-2xl font-bold text-orange-400">{stats.justifications}</div><div className="text-xs text-gray-400">Justificativas</div></div>
                </div>
                 <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
                    <input type="text" placeholder="Buscar por nome ou email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full md:w-auto px-3 py-2 border border-gray-600 rounded-md bg-gray-800" />
                    <div className="flex flex-wrap gap-2">
                        {stats.pendingJustifications > 0 && (
                             <button onClick={handleAcceptAllJustifications} disabled={isProcessing === 'accept_justifications'} className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-md text-sm disabled:opacity-50">{isProcessing === 'accept_justifications' ? 'Processando...' : `Aceitar ${stats.pendingJustifications} Justificativas`}</button>
                        )}
                        <button onClick={handleSendAllReminders} disabled={isProcessing === 'reminders'} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"><MegaphoneIcon className="w-4 h-4"/>{isProcessing === 'reminders' ? 'Enviando...' : 'Lembrete Geral'}</button>
                        <button onClick={() => setIsAssignModalOpen(true)} className="px-3 py-2 bg-primary text-white rounded-md text-sm">Atribuir a Mais</button>
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Justificativa</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Comprovação</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredAssignments.map(a => (
                                <tr key={a.id}>
                                    <td className="px-4 py-3 whitespace-nowrap"><div className="font-medium">{a.promoterName}</div><div className="text-xs text-gray-400">{a.promoterEmail}</div></td>
                                    <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(a)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{getJustificationBadge(a)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {a.proofImageUrls && a.proofImageUrls.length > 0 && (
                                            <a href={a.proofImageUrls[0]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm">Ver Print</a>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm space-x-4">
                                        {a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification && (
                                            <button onClick={() => handleSendSingleReminder(a.id)} disabled={isProcessing === `reminder-${a.id}`} className="text-blue-400 hover:text-blue-300 disabled:opacity-50">Lembrete</button>
                                        )}
                                        <button onClick={() => openStatsModal(a)} className="text-indigo-400 hover:text-indigo-300">Stats</button>
                                        <button onClick={() => openStatusModal(a)} className="text-yellow-400 hover:text-yellow-300">Status</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleUpdatePost} />
            <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedAssignment} />
            <ChangeAssignmentStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} assignment={selectedAssignment} onSave={handleSaveAssignmentStatus} />
        </div>
    );
};
