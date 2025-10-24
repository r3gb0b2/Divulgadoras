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
import { Timestamp } from 'firebase/firestore';
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
    const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'justified'>('all');
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
    
    const handleUpdatePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        setError('');
        
        let finalUpdateData = { ...updatedData };

        if (newMediaFile && post.type === 'image') {
            try {
                const fileExtension = newMediaFile.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = ref(storage, `posts-media/${fileName}`);
                await uploadBytes(storageRef, newMediaFile);
                finalUpdateData.mediaUrl = storageRef.fullPath;
            } catch (uploadError) {
                console.error("Error uploading new image:", uploadError);
                setError("Falha ao enviar nova imagem.");
                throw uploadError;
            }
        }

        try {
            await updatePost(post.id, finalUpdateData);
            setIsEditModalOpen(false);
            await fetchData();
            alert("Publicação atualizada com sucesso!");
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar as alterações.');
            throw err;
        }
    };
    
    const handleDeletePost = async () => {
        if (!post || !canManage) return;
        if (window.confirm("Tem certeza que deseja excluir esta publicação e todas as suas atribuições? Esta ação não pode ser desfeita.")) {
            setIsProcessing('delete-post');
            try {
                await deletePost(post.id);
                alert("Publicação excluída com sucesso.");
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message || "Falha ao excluir.");
            } finally {
                setIsProcessing(null);
            }
        }
    };
    
    const handleSendReminders = async () => {
        if (!post || !canManage) return;
        const pendingCount = assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification).length;
        if (pendingCount === 0) {
            alert("Nenhuma divulgadora pendente de comprovação para notificar.");
            return;
        }
        if (window.confirm(`Isso enviará um e-mail de lembrete para ${pendingCount} divulgadora(s) que confirmaram mas ainda não enviaram o print. Deseja continuar?`)) {
            setIsProcessing('remind-all');
            try {
                const result = await sendPostReminder(post.id);
                alert(result.message);
                await fetchData();
            } catch (err: any) {
                setError(err.message || "Falha ao enviar lembretes.");
            } finally {
                setIsProcessing(null);
            }
        }
    };
    
    const handleSendSingleReminder = async (assignmentId: string) => {
        if (!canManage) return;
        setIsProcessing(`remind-${assignmentId}`);
        try {
            const result = await sendSinglePostReminder(assignmentId);
            alert(result.message);
            await fetchData();
        } catch(err: any) {
            setError(err.message || "Falha ao enviar lembrete.");
        } finally {
            setIsProcessing(null);
        }
    }
    
     const handleRenewDeadline = async (assignmentId: string) => {
        if (!canManage) return;
        if (window.confirm("Isso reiniciará o cronômetro de 24 horas para envio do print a partir de agora. Deseja continuar?")) {
            setIsProcessing(`renew-${assignmentId}`);
            try {
                await renewAssignmentDeadline(assignmentId);
                await fetchData();
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleCopyLink = () => {
        if (!post?.postLink) return;
        navigator.clipboard.writeText(post.postLink).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };
    
    const handleSaveJustificationStatus = async (assignmentId: string, data: Partial<Pick<PostAssignment, 'justificationStatus'>>) => {
        await updateAssignment(assignmentId, data);
        await fetchData();
    };

    const stats = useMemo(() => {
        const assigned = assignments.length;
        const confirmed = assignments.filter(a => a.status === 'confirmed').length;
        const completed = assignments.filter(a => !!a.proofSubmittedAt).length;
        const justified = assignments.filter(a => !!a.justification).length;
        return { assigned, confirmed, completed, justified };
    }, [assignments]);
    
    const filteredAssignments = useMemo(() => {
        let results = [...assignments];
        if (filter !== 'all') {
            switch (filter) {
                case 'pending': results = results.filter(a => a.status === 'pending'); break;
                case 'confirmed': results = results.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification); break;
                case 'completed': results = results.filter(a => !!a.proofSubmittedAt); break;
                case 'justified': results = results.filter(a => !!a.justification); break;
            }
        }
        if (searchQuery) {
            results = results.filter(a => a.promoterName.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return results;
    }, [assignments, filter, searchQuery]);


    if (isLoading) return <div className="text-center p-8">Carregando detalhes...</div>;
    if (error && !post) return <div className="text-red-500 text-center p-8">{error}</div>;
    if (!post) return <div className="text-center p-8">Publicação não encontrada.</div>;

    const getStatusBadge = (a: PostAssignment) => {
        if (a.proofSubmittedAt) return <span className="text-xs font-bold text-green-400">COMPROVADO</span>;
        if (a.justification) return <span className="text-xs font-bold text-yellow-400">JUSTIFICADO</span>;
        if (a.status === 'confirmed') return <span className="text-xs font-bold text-blue-400">CONFIRMADO</span>;
        return <span className="text-xs font-bold text-gray-400">PENDENTE</span>;
    };

    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar para Publicações</span>
            </button>
            {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Post Details */}
                <div className="lg:col-span-1 bg-secondary p-6 rounded-lg shadow-lg space-y-4">
                     <div>
                        <h1 className="text-2xl font-bold">{post.campaignName}</h1>
                        {post.eventName && <p className="text-lg text-primary">{post.eventName}</p>}
                    </div>
                    {(post.type === 'image' || post.type === 'video') && post.mediaUrl && (
                        <StorageMedia path={post.mediaUrl} type={post.type} className="w-full rounded-md" controls={post.type === 'video'} />
                    )}
                    {post.type === 'text' && (
                        <div className="bg-dark/70 p-3 rounded-md text-sm text-gray-300 whitespace-pre-wrap">{post.textContent}</div>
                    )}
                    
                    <div className="space-y-1">
                        <h3 className="font-semibold text-gray-200">Instruções:</h3>
                        <p className="text-sm text-gray-400 whitespace-pre-wrap">{post.instructions}</p>
                    </div>
                    
                     {post.postLink && (
                        <div className="space-y-1">
                            <h3 className="font-semibold text-gray-200">Link da Postagem:</h3>
                             <div className="flex items-center gap-2">
                                <input type="text" readOnly value={post.postLink} className="flex-grow w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-sm" />
                                <button onClick={handleCopyLink} className="flex-shrink-0 p-2 bg-gray-600 rounded-md hover:bg-gray-500" title="Copiar Link">
                                    {linkCopied ? <span className="text-xs">Copiado!</span> : <LinkIcon className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <div className="text-xs text-gray-400 space-y-1 border-t border-gray-700 pt-3">
                        <p><strong>Status:</strong> <span className={post.isActive ? 'text-green-300' : 'text-red-300'}>{post.isActive ? 'Ativo' : 'Inativo'}</span></p>
                        <p><strong>Expira em:</strong> {formatDate(post.expiresAt)}</p>
                        <p><strong>Auto-atribuição:</strong> {post.autoAssignToNewPromoters ? 'Sim' : 'Não'}</p>
                        <p><strong>Permite atraso:</strong> {post.allowLateSubmissions ? 'Sim' : 'Não'}</p>
                    </div>

                    {canManage && (
                        <div className="flex flex-wrap gap-2 border-t border-gray-700 pt-3">
                            <button onClick={() => setIsEditModalOpen(true)} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-semibold">Editar Conteúdo</button>
                             <button onClick={() => navigate(`/admin/posts/new?fromPost=${post.id}`)} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold">Duplicar</button>
                            <button onClick={handleDeletePost} disabled={isProcessing === 'delete-post'} className="w-full px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">
                                {isProcessing === 'delete-post' ? 'Excluindo...' : 'Excluir Publicação'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Column: Assignments */}
                <div className="lg:col-span-2 bg-secondary p-6 rounded-lg shadow-lg">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                        <h2 className="text-2xl font-bold">Divulgadoras Designadas</h2>
                        <div className="flex flex-wrap gap-2">
                            {canManage && <button onClick={() => setIsAssignModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold">+ Atribuir Novas</button>}
                            {canManage && <button onClick={handleSendReminders} disabled={isProcessing === 'remind-all'} className="px-4 py-2 bg-yellow-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">Lembrar Pendentes</button>}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-center">
                        <div className="bg-dark/70 p-2 rounded-md"><p className="text-2xl font-bold">{stats.assigned}</p><p className="text-xs text-gray-400">Designadas</p></div>
                        <div className="bg-dark/70 p-2 rounded-md"><p className="text-2xl font-bold text-blue-400">{stats.confirmed}</p><p className="text-xs text-gray-400">Confirmadas</p></div>
                        <div className="bg-dark/70 p-2 rounded-md"><p className="text-2xl font-bold text-green-400">{stats.completed}</p><p className="text-xs text-gray-400">Comprovadas</p></div>
                        <div className="bg-dark/70 p-2 rounded-md"><p className="text-2xl font-bold text-yellow-400">{stats.justified}</p><p className="text-xs text-gray-400">Justificativas</p></div>
                    </div>

                     <div className="flex flex-col sm:flex-row gap-2 mb-4">
                         <input type="text" placeholder="Buscar por nome..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200" />
                        <select value={filter} onChange={e => setFilter(e.target.value as any)} className="px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200">
                            <option value="all">Todos</option>
                            <option value="pending">Pendentes</option>
                            <option value="confirmed">Confirmados (sem print)</option>
                            <option value="completed">Comprovados</option>
                            <option value="justified">Com Justificativa</option>
                        </select>
                    </div>

                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                        {filteredAssignments.map(a => (
                            <div key={a.id} className="bg-dark/70 p-3 rounded-md">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold">{a.promoterName}</p>
                                        <p className="text-xs text-gray-400">{a.promoterEmail}</p>
                                    </div>
                                    <div className="flex items-center gap-2">{getStatusBadge(a)}</div>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {a.confirmedAt && `Confirmou: ${formatDate(a.confirmedAt)}`}{a.proofSubmittedAt && ` | Comprovou: ${formatDate(a.proofSubmittedAt)}`}
                                </div>
                                
                                {a.proofImageUrls && a.proofImageUrls.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {a.proofImageUrls.map((url, i) => <img key={i} src={url} alt={`Prova ${i}`} className="w-16 h-16 object-cover rounded cursor-pointer" onClick={() => { setPhotoViewerUrls(a.proofImageUrls || []); setIsPhotoViewerOpen(true); }} />)}
                                    </div>
                                )}
                                
                                {a.justification && (
                                     <div className="mt-2 text-sm bg-gray-800 p-2 rounded">
                                        <p className="font-semibold text-yellow-300">Justificativa:</p>
                                        <p className="italic text-gray-300">"{a.justification}" ({a.justificationStatus || 'pendente'})</p>
                                        {a.justificationImageUrls && a.justificationImageUrls.length > 0 && (
                                            <div className="flex gap-2 mt-2">
                                                {a.justificationImageUrls.map((url, i) => <img key={i} src={url} alt={`Anexo ${i}`} className="w-12 h-12 object-cover rounded cursor-pointer" onClick={() => { setPhotoViewerUrls(a.justificationImageUrls || []); setIsPhotoViewerOpen(true); }} />)}
                                            </div>
                                        )}
                                     </div>
                                )}
                                
                                {canManage && (
                                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs font-medium mt-2 border-t border-gray-700/50 pt-2">
                                        <button onClick={() => { setSelectedAssignment(a); setIsStatsModalOpen(true); }} className="text-indigo-400 hover:underline">Ver Stats</button>
                                        {a.justification && <button onClick={() => {setSelectedAssignment(a); setIsJustifyModalOpen(true);}} className="text-yellow-400 hover:underline">Analisar</button>}
                                        {a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification && (
                                            <>
                                                <button onClick={() => handleRenewDeadline(a.id)} disabled={isProcessing === `renew-${a.id}`} className="text-green-400 hover:underline disabled:opacity-50">Renovar Prazo</button>
                                                <button onClick={() => handleSendSingleReminder(a.id)} disabled={isProcessing === `remind-${a.id}`} className="text-blue-400 hover:underline disabled:opacity-50">Lembrete</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                         {filteredAssignments.length === 0 && <p className="text-center text-gray-400 py-6">Nenhuma divulgadora encontrada com os filtros atuais.</p>}
                    </div>
                </div>
            </div>
            
            {/* Modals */}
            {canManage && (
                <>
                    <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleUpdatePost} />
                    <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
                    <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedAssignment} />
                    <ChangeAssignmentStatusModal isOpen={isJustifyModalOpen} onClose={() => setIsJustifyModalOpen(false)} assignment={selectedAssignment} onSave={handleSaveJustificationStatus} />
                </>
            )}
             <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={0} />
        </div>
    );
};
