import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment } from '../types';
import {
    getPostWithAssignments,
    updatePost,
    deletePost,
    sendPostReminder,
    sendSinglePostReminder,
    renewAssignmentDeadline,
    updateAssignment
} from '../services/postService';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/config';

// Components
import StorageMedia from '../components/StorageMedia';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';

// Icons
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Helper to safely convert various date formats to a Date object
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) {
        return null;
    }
    // Firestore Timestamp
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    // Serialized Timestamp object
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        return new Date(timestamp.seconds * 1000);
    }
    // ISO string or number (milliseconds)
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
};

export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);

    // Filters for assignments
    const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'justified' | 'missed'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Modals state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);

    const canManage = adminData?.role === 'admin' || adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!postId) {
            setError("ID da publicação não encontrado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const { post: fetchedPost, assignments: fetchedAssignments } = await getPostWithAssignments(postId);
            setPost(fetchedPost);
            setAssignments(fetchedAssignments.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const isExpired = useCallback((assignment: PostAssignment): boolean => {
        // An assignment isn't "expired" if it's already resolved one way or another.
        if (assignment.proofSubmittedAt || assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') {
            return false;
        }
    
        const now = new Date();
        
        // Check main post expiration for 'pending' assignments
        if (assignment.status === 'pending') {
            const postExpiresAt = toDateSafe(post?.expiresAt);
            if (postExpiresAt && now > postExpiresAt) {
                return true;
            }
        }
        
        // Check 24h proof submission deadline for 'confirmed' assignments
        if (assignment.status === 'confirmed' && assignment.confirmedAt && !post?.allowLateSubmissions) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if(confirmedAt) {
                const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                if (now > proofDeadline) {
                    return true;
                }
            }
        }
        
        return false;
    }, [post]);

    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!postId) return;
        
        let finalMediaUrl: string | undefined = undefined;
        if (newMediaFile) {
            const fileExtension = newMediaFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = ref(storage, `posts-media/${fileName}`);
            await uploadBytes(storageRef, newMediaFile);
            finalMediaUrl = storageRef.fullPath;
        }

        const dataToSave = { ...updatedData };
        if (finalMediaUrl) {
            dataToSave.mediaUrl = finalMediaUrl;
        }

        await updatePost(postId, dataToSave);
        await fetchData(); // Refresh data
    };
    
    const handleDelete = async () => {
        if (!postId) return;
        if (window.confirm("Tem certeza que deseja deletar esta publicação e todas as suas atribuições? Esta ação não pode ser desfeita.")) {
            try {
                await deletePost(postId);
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message);
            }
        }
    };
    
    const handleSendAllReminders = async () => {
        if (!postId) return;
        setIsProcessing('all-reminders');
        try {
            const result = await sendPostReminder(postId);
            alert(result.message);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleSendSingleReminder = async (assignmentId: string) => {
        setIsProcessing(assignmentId);
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

    const handleRenewDeadline = async (assignmentId: string) => {
        if (!window.confirm("Isso reiniciará o prazo de 24 horas para esta divulgadora enviar a comprovação. Deseja continuar?")) return;
        setIsProcessing(assignmentId);
        try {
            await renewAssignmentDeadline(assignmentId);
            await fetchData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleConcludeManually = async (assignmentId: string) => {
        if (!window.confirm("Tem certeza que deseja concluir manualmente esta tarefa? Use isso apenas se a divulgadora enviou a comprovação por outro meio.")) return;
        setIsProcessing(assignmentId);
        try {
            await updateAssignment(assignmentId, { proofSubmittedAt: serverTimestamp() });
            await fetchData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(null);
        }
    };
    
    const handleJustificationSave = async (assignmentId: string, data: Partial<Pick<PostAssignment, 'justificationStatus'>>) => {
        await updateAssignment(assignmentId, data);
        await fetchData(); // Refresh data
    };

    const handleCopyLink = () => {
        if (!post?.postLink) return;
        navigator.clipboard.writeText(post.postLink).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };
    
    const stats = useMemo(() => {
        const total = assignments.length;
        if (total === 0) return { total: 0, pending: 0, confirmed: 0, completed: 0, justified: 0, missed: 0 };

        let pending = 0;
        let confirmed = 0;
        let completed = 0;
        let justified = 0;
        let missed = 0;

        assignments.forEach(a => {
            const isCompletedWithProof = !!a.proofSubmittedAt;
            const isCompletedWithJustification = a.justificationStatus === 'accepted';
            
            if (isCompletedWithProof || isCompletedWithJustification) {
                completed++;
            } else if (a.justificationStatus === 'rejected' || isExpired(a)) {
                missed++;
            } else if (a.justificationStatus === 'pending') {
                justified++;
            } else if (a.status === 'confirmed') {
                confirmed++;
            } else if (a.status === 'pending') {
                pending++;
            }
        });

        return { total, pending, confirmed, completed, justified, missed };
    }, [assignments, isExpired]);

    const filterLabels: { [key in typeof filter]: string } = {
        all: 'Todos',
        pending: 'Pendentes',
        confirmed: 'Confirmados',
        completed: 'Concluídos',
        justified: 'Justificativas',
        missed: 'Perdidas',
    };
    
    const filteredAssignments = useMemo(() => {
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        const searched = searchQuery
            ? assignments.filter(a =>
                a.promoterName.toLowerCase().includes(lowercasedQuery) ||
                a.promoterEmail.toLowerCase().includes(lowercasedQuery)
              )
            : assignments;
    
        if (filter === 'all') return searched;
    
        return searched.filter(a => {
            const isCompletedWithProof = !!a.proofSubmittedAt;
            const isCompletedWithJustification = a.justificationStatus === 'accepted';
            const isCompleted = isCompletedWithProof || isCompletedWithJustification;
            
            const isMissedByRejection = a.justificationStatus === 'rejected';
            const isMissedByDeadline = isExpired(a); // isExpired already checks for resolved states
            const isMissed = isMissedByRejection || isMissedByDeadline;
            
            const isJustifiedPending = a.justificationStatus === 'pending';
    
            switch (filter) {
                case 'pending':
                    // Pending confirmation, not yet expired/resolved
                    return a.status === 'pending' && !isMissed && !isCompleted && !isJustifiedPending;
                case 'confirmed':
                    // Confirmed, but awaiting proof, not yet expired/resolved
                    return a.status === 'confirmed' && !isCompleted && !isMissed && !isJustifiedPending;
                case 'completed':
                    return isCompleted;
                case 'justified': // Show only pending justifications
                    return isJustifiedPending;
                case 'missed':
                    return isMissed;
                default:
                    return true;
            }
        });
    }, [assignments, filter, searchQuery, isExpired]);

    const getStatusInfo = (assignment: PostAssignment) => {
        // 1. Final "good" states
        if (assignment.proofSubmittedAt) {
            return { text: `Concluído ${formatDate(assignment.proofSubmittedAt)}`, color: 'bg-green-900/50 text-green-300' };
        }
        if (assignment.justificationStatus === 'accepted') {
            return { text: `Concluído (Justificativa Aceita)`, color: 'bg-green-900/50 text-green-300' };
        }
        
        // 2. Final "bad" states
        if (assignment.justificationStatus === 'rejected') {
            return { text: 'Perdido (Justificativa Recusada)', color: 'bg-red-900/50 text-red-300' };
        }
        if (isExpired(assignment)) {
            return { text: 'Perdido (Prazo Esgotado)', color: 'bg-red-900/50 text-red-300' };
        }
    
        // 3. Intermediate states
        if (assignment.justificationStatus === 'pending') {
            return { text: 'Justificativa Pendente', color: 'bg-yellow-900/50 text-yellow-300' };
        }
        if (assignment.status === 'confirmed') {
            return { text: `Confirmado ${formatDate(assignment.confirmedAt)}`, color: 'bg-blue-900/50 text-blue-300' };
        }
    
        // 4. Default initial state
        return { text: 'Pendente de Confirmação', color: 'bg-yellow-900/50 text-yellow-300' };
    };
    
    if (isLoading) {
        return <div className="text-center py-10">Carregando...</div>;
    }

    if (error && !post) {
        return <div className="text-red-400 text-center py-10">{error}</div>;
    }

    if (!post) {
        return <div className="text-center py-10">Publicação não encontrada.</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar</span>
                </button>
            </div>
            {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Post Details */}
                <div className="lg:col-span-1 bg-secondary shadow-lg rounded-lg p-6 self-start">
                    <h1 className="text-2xl font-bold text-primary">{post.campaignName}</h1>
                    {post.eventName && <p className="text-lg text-gray-200 font-semibold -mt-1">{post.eventName}</p>}
                    <p className="text-xs text-gray-400">Criado por {post.createdByEmail} em {formatDate(post.createdAt)}</p>

                    <div className="my-4">
                        {(post.type === 'image' || post.type === 'video') && post.mediaUrl && <StorageMedia path={post.mediaUrl} type={post.type} className="w-full rounded-md" controls />}
                        {post.type === 'text' && <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm bg-dark/70 p-3 rounded-md">{post.textContent}</pre>}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-gray-200">Instruções</h3>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap bg-dark/70 p-2 rounded-md">{post.instructions}</p>
                        </div>
                        {post.postLink && (
                            <div>
                                <h3 className="font-semibold text-gray-200">Link da Postagem</h3>
                                <div className="flex items-center gap-2">
                                    <input type="text" readOnly value={post.postLink} className="flex-grow w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-xs" />
                                    <button onClick={handleCopyLink} className="flex-shrink-0 p-2 bg-gray-600 rounded-md hover:bg-gray-500"><LinkIcon className="w-4 h-4" /></button>
                                </div>
                                {linkCopied && <span className="text-xs text-green-400">Copiado!</span>}
                            </div>
                        )}
                    </div>
                    
                    {canManage && (
                        <div className="border-t border-gray-700 mt-6 pt-4 flex flex-wrap gap-2">
                            <button onClick={() => setIsEditModalOpen(true)} className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm">Editar Post</button>
                            <button onClick={() => setIsAssignModalOpen(true)} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Atribuir Novas</button>
                            <button onClick={() => navigate(`/admin/posts/new?fromPost=${postId}`)} className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">Duplicar</button>
                            <button onClick={handleDelete} className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">Deletar Post</button>
                        </div>
                    )}
                </div>

                {/* Right Column: Assignments */}
                <div className="lg:col-span-2 bg-secondary shadow-lg rounded-lg p-6">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                        <h2 className="text-xl font-bold">Divulgadoras Designadas ({stats.total})</h2>
                        {canManage && (
                            <button onClick={handleSendAllReminders} disabled={isProcessing === 'all-reminders'} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark text-sm disabled:opacity-50 w-full sm:w-auto">
                                {isProcessing === 'all-reminders' ? 'Enviando...' : 'Enviar Lembrete para Todas Pendentes'}
                            </button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs mb-4">
                        <div className="bg-dark/70 p-2 rounded"><div className="font-bold text-lg text-white">{stats.total}</div><div className="text-gray-400">Total</div></div>
                        <div className="bg-dark/70 p-2 rounded"><div className="font-bold text-lg text-yellow-400">{stats.pending}</div><div className="text-gray-400">Pendentes</div></div>
                        <div className="bg-dark/70 p-2 rounded"><div className="font-bold text-lg text-blue-400">{stats.confirmed}</div><div className="text-gray-400">Confirmadas</div></div>
                        <div className="bg-dark/70 p-2 rounded"><div className="font-bold text-lg text-green-400">{stats.completed}</div><div className="text-gray-400">Concluídas</div></div>
                        <div className="bg-dark/70 p-2 rounded"><div className="font-bold text-lg text-yellow-400">{stats.justified}</div><div className="text-gray-400">Justificativas</div></div>
                        <div className="bg-dark/70 p-2 rounded"><div className="font-bold text-lg text-red-400">{stats.missed}</div><div className="text-gray-400">Perdidas</div></div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mb-4">
                        <div className="flex flex-wrap items-center gap-2 p-1 bg-dark/70 rounded-lg flex-grow">
                            {(Object.keys(filterLabels) as Array<keyof typeof filterLabels>).map(f => (
                                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                    {filterLabels[f]} ({stats[f] || stats.total})
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por nome ou email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-auto px-3 py-1.5 border border-gray-600 rounded-md bg-gray-800 text-sm"
                        />
                    </div>
                    
                    <div className="space-y-3">
                        {filteredAssignments.map(a => {
                            const status = getStatusInfo(a);
                            return (
                                <div key={a.id} className="bg-dark/70 p-3 rounded-md">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-start">
                                        <div>
                                            <p className="font-semibold text-white">{a.promoterName}</p>
                                            <p className="text-xs text-gray-400">{a.promoterEmail}</p>
                                        </div>
                                        <div className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${status.color} mt-1 sm:mt-0`}>
                                            {status.text}
                                        </div>
                                    </div>
                                    <div className="border-t border-gray-700 mt-2 pt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs">
                                        <button onClick={() => { setSelectedAssignment(a); setIsStatsModalOpen(true); }} className="text-blue-400 hover:underline">Ver Stats</button>
                                        {a.justification && canManage && <button onClick={() => { setSelectedAssignment(a); setIsJustifyModalOpen(true); }} className="text-yellow-400 hover:underline">Analisar Justificativa</button>}
                                        {a.justificationImageUrls && a.justificationImageUrls.length > 0 && <button onClick={() => { setPhotoViewerUrls(a.justificationImageUrls!); setIsPhotoViewerOpen(true); }} className="text-indigo-400 hover:underline">Ver Anexo</button>}
                                        {a.proofImageUrls && a.proofImageUrls.length > 0 && <button onClick={() => { setPhotoViewerUrls(a.proofImageUrls!); setIsPhotoViewerOpen(true); }} className="text-green-400 hover:underline">Ver Comprovação</button>}
                                        {canManage && a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification && (
                                            <>
                                                <button onClick={() => handleConcludeManually(a.id)} disabled={isProcessing === a.id} className="text-green-500 hover:underline disabled:opacity-50">{isProcessing === a.id ? '...' : 'Concluir Manualmente'}</button>
                                                <button onClick={() => handleRenewDeadline(a.id)} disabled={isProcessing === a.id} className="text-orange-400 hover:underline disabled:opacity-50">{isProcessing === a.id ? '...' : 'Renovar Prazo'}</button>
                                                <button onClick={() => handleSendSingleReminder(a.id)} disabled={isProcessing === a.id} className="text-primary hover:underline disabled:opacity-50">{isProcessing === a.id ? '...' : 'Lembrete'}</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {canManage && <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />}
            {canManage && <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />}
            <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedAssignment} />
            {canManage && <ChangeAssignmentStatusModal isOpen={isJustifyModalOpen} onClose={() => setIsJustifyModalOpen(false)} assignment={selectedAssignment} onSave={handleJustificationSave} />}
            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={0} />
        </div>
    );
};
