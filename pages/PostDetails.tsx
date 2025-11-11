import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment, Promoter, Timestamp } from '../types';
import { getPostWithAssignments, getAssignmentsForOrganization, sendPostReminder, sendPendingReminders, updatePost, deletePost, acceptAllJustifications, updateAssignment } from '../services/postService';
import { getPromotersByIds } from '../services/promoterService';
import { ArrowLeftIcon, MegaphoneIcon, PencilIcon, TrashIcon, UserPlusIcon, CheckCircleIcon, SearchIcon, InstagramIcon, WhatsAppIcon } from '../components/Icons';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import StorageMedia from '../components/StorageMedia';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import { storage } from '../firebase/config';

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const getPerformanceColor = (rate: number): string => {
    if (rate < 0) return 'text-gray-200';
    if (rate === 100) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 31) return 'text-yellow-400';
    return 'text-red-400';
};

const getJustificationStatusBadge = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => {
    const effectiveStatus = status || 'pending';
    const styles = {
        pending: "bg-yellow-900/50 text-yellow-300",
        accepted: "bg-green-900/50 text-green-300",
        rejected: "bg-red-900/50 text-red-300",
    };
    const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" };
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[effectiveStatus]}`}>{text[effectiveStatus]}</span>;
};

export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [allOrgAssignments, setAllOrgAssignments] = useState<PostAssignment[]>([]);
    const [promotersMap, setPromotersMap] = useState<Map<string, Promoter>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingAction, setProcessingAction] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modals state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);
    const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);

    // Filtering
    const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'justification'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const showSuccessMessage = (message: string) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

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

            // Fetch all org assignments for stats calculation
            const orgAssignments = await getAssignmentsForOrganization(postData.organizationId);
            setAllOrgAssignments(orgAssignments);

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

    const assignmentsWithStats = useMemo(() => {
        const promoterStatsMap = new Map<string, { assigned: number; completed: number; acceptedJustifications: number; missed: number; pending: number }>();
        const now = new Date();

        allOrgAssignments.forEach(a => {
            if (!a.post) return;
            const promoterId = a.promoterId;
            const stats = promoterStatsMap.get(promoterId) || { assigned: 0, completed: 0, acceptedJustifications: 0, missed: 0, pending: 0 };
            
            stats.assigned++;

            if (a.proofSubmittedAt) {
                stats.completed++;
            } else if (a.justification) {
                if (a.justificationStatus === 'accepted') {
                    stats.acceptedJustifications++;
                } else if (a.justificationStatus === 'rejected') {
                    stats.missed++;
                } else { // 'pending'
                    stats.pending++;
                }
            } else {
                let deadlineHasPassed = false;
                if (!a.post.allowLateSubmissions) {
                    const confirmedAt = toDateSafe(a.confirmedAt);
                    if (confirmedAt) {
                        const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                        if (now > proofDeadline) {
                            deadlineHasPassed = true;
                        }
                    }
                    if (!deadlineHasPassed) {
                        const postExpiresAt = toDateSafe(a.post.expiresAt);
                        if (postExpiresAt && now > postExpiresAt) {
                            deadlineHasPassed = true;
                        }
                    }
                }
                if (deadlineHasPassed) {
                    stats.missed++;
                } else {
                    stats.pending++;
                }
            }
            promoterStatsMap.set(promoterId, stats);
        });

        return assignments.map(a => {
            const stats = promoterStatsMap.get(a.promoterId);
            const successfulOutcomes = stats ? stats.completed + stats.acceptedJustifications : 0;
            const completionRate = stats && stats.assigned > 0
                ? Math.round((successfulOutcomes / stats.assigned) * 100)
                : -1; // -1 for no data
            return { ...a, completionRate };
        });
    }, [assignments, allOrgAssignments]);

    const filteredAssignments = useMemo(() => {
        let results = assignmentsWithStats;
        if (filter !== 'all') {
            results = results.filter(a => {
                switch (filter) {
                    case 'pending': return a.status === 'pending';
                    case 'confirmed': return a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification;
                    case 'completed': return !!a.proofSubmittedAt;
                    case 'justification': return !!a.justification;
                    default: return true;
                }
            });
        }
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            results = results.filter(a =>
                a.promoterName.toLowerCase().includes(lowerQuery) ||
                promotersMap.get(a.promoterId)?.instagram?.toLowerCase().includes(lowerQuery)
            );
        }
        return results;
    }, [assignmentsWithStats, filter, searchQuery, promotersMap]);

    const counts = useMemo(() => ({
        all: assignments.length,
        pending: assignments.filter(a => a.status === 'pending').length,
        confirmed: assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification).length,
        completed: assignments.filter(a => !!a.proofSubmittedAt).length,
        justification: assignments.filter(a => !!a.justification).length,
    }), [assignments]);


    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        setProcessingAction('save');
        setError('');
        try {
            const dataToSave: Partial<Post> = { ...updatedData };
            
            if (newMediaFile) {
                // Delete old file from storage if it exists and is a firebase storage URL
                if (post.mediaUrl && post.mediaUrl.includes('firebasestorage')) {
                    try {
                        const oldRef = storage.refFromURL(post.mediaUrl);
                        await oldRef.delete();
                    } catch (deleteError: any) {
                        console.warn("Could not delete old media file:", deleteError.message);
                    }
                }
                
                // Upload new file
                const fileExtension = newMediaFile.name.split('.').pop();
                const fileName = `posts-media/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = storage.ref(fileName);
                await storageRef.put(newMediaFile);
                dataToSave.mediaUrl = await storageRef.getDownloadURL();
            }
            
            await updatePost(post.id, dataToSave);
            showSuccessMessage('Publicação atualizada com sucesso!');
            await fetchData();
            setIsEditModalOpen(false);
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar as alterações.');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleDeletePost = async () => {
        if (!post || !window.confirm(`Tem certeza que deseja DELETAR esta publicação (${post.campaignName}) e todas as suas ${assignments.length} tarefas associadas? Esta ação é irreversível.`)) {
            return;
        }
        setProcessingAction('delete');
        setError('');
        try {
            await deletePost(post.id);
            alert("Publicação deletada com sucesso.");
            navigate('/admin/posts');
        } catch (err: any) {
            setError(err.message || "Falha ao deletar a publicação.");
        } finally {
            setProcessingAction(null);
        }
    };

    const handleSendReminders = async () => {
        if (!post || !window.confirm("Isso enviará um e-mail de lembrete para todas as divulgadoras que confirmaram mas ainda não enviaram a comprovação. Deseja continuar?")) {
            return;
        }
        setProcessingAction('remind');
        setError('');
        try {
            const result = await sendPostReminder(post.id);
            showSuccessMessage(result.message || `${result.count} lembretes enviados.`);
            await fetchData(); // To update last reminder timestamps
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar lembretes.');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleSendPendingReminders = async () => {
        if (!post || !window.confirm("Isso enviará um e-mail de lembrete para todas as divulgadoras que AINDA NÃO CONFIRMARAM esta publicação. Deseja continuar?")) {
            return;
        }
        setProcessingAction('remind_pending');
        setError('');
        try {
            const result = await sendPendingReminders(post.id);
            showSuccessMessage(result.message || `${result.count} lembretes enviados.`);
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar lembretes.');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleAcceptAllJustifications = async () => {
        if (!post || !window.confirm("Tem certeza que deseja aceitar TODAS as justificativas pendentes para esta publicação?")) {
            return;
        }
        setProcessingAction('accept_all_justifications');
        setError('');
        try {
            const result = await acceptAllJustifications(post.id);
            showSuccessMessage(result.message || `${result.count} justificativas aceitas.`);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao aceitar justificativas.');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleOpenStatusModal = (assignment: PostAssignment) => {
        setSelectedAssignment(assignment);
        setIsStatusModalOpen(true);
    };
    
    const handleSaveAssignmentStatus = async (assignmentId: string, data: Partial<PostAssignment>) => {
        await updateAssignment(assignmentId, data);
        await fetchData(); // Refresh list
    };
    
    const handleOpenStatsModal = (promoterId: string) => {
        const promoter = promotersMap.get(promoterId);
        if (promoter) {
            setSelectedPromoter(promoter);
            setIsStatsModalOpen(true);
        }
    };

    if (isLoading && !post) {
        return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    }
    if (error && !post) {
        return <div className="text-red-400 text-center py-10">{error}</div>;
    }
    if (!post) {
        return <div className="text-center py-10">Publicação não encontrada.</div>;
    }

    const isExpired = post.expiresAt && toDateSafe(post.expiresAt) < new Date();

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                 <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Todas as Publicações</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">{post.campaignName}</h1>
                    {post.eventName && <p className="text-lg text-primary -mt-1">{post.eventName}</p>}
                </div>
            </div>
            {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
            {successMessage && <div className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4 text-sm font-semibold">{successMessage}</div>}

            {/* Post Content & Actions */}
            <div className="bg-secondary p-4 rounded-lg shadow-lg mb-6">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1">
                        <StorageMedia path={post.mediaUrl || post.googleDriveUrl || ''} type={post.type} className="w-full h-auto object-contain rounded-md bg-dark" />
                    </div>
                    <div className="md:col-span-2 space-y-4">
                        <div className="flex justify-between items-start">
                             <div>
                                <p>Status: <span className={`font-semibold ${post.isActive && !isExpired ? 'text-green-400' : 'text-red-400'}`}>{post.isActive && !isExpired ? 'Ativo' : 'Inativo/Expirado'}</span></p>
                                <p className="text-sm text-gray-400">Criado em: {formatDate(post.createdAt)}</p>
                                {post.expiresAt && <p className="text-sm text-gray-400">Expira em: {formatDate(post.expiresAt)}</p>}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setIsEditModalOpen(true)} className="p-2 bg-gray-600 rounded-md hover:bg-gray-500" title="Editar Conteúdo"><PencilIcon className="w-5 h-5"/></button>
                                <button onClick={handleDeletePost} disabled={!!processingAction} className="p-2 bg-red-800 rounded-md hover:bg-red-700 disabled:opacity-50" title="Deletar Post"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </div>
                        <div className="space-y-3 bg-dark/50 p-3 rounded-md">
                             <h3 className="font-semibold">Ações em Massa</h3>
                             <div className="flex flex-wrap gap-2">
                                <button onClick={() => setIsAssignModalOpen(true)} disabled={!!processingAction} className="flex-1 sm:flex-none flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold disabled:opacity-50"><UserPlusIcon className="w-4 h-4"/> Atribuir Novas</button>
                                <button onClick={handleSendReminders} disabled={!!processingAction} className="flex-1 sm:flex-none flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-md text-sm font-semibold disabled:opacity-50"><MegaphoneIcon className="w-4 h-4"/> Lembrar Comprovação</button>
                                <button onClick={handleSendPendingReminders} disabled={!!processingAction} className="flex-1 sm:flex-none flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-md text-sm font-semibold disabled:opacity-50"><MegaphoneIcon className="w-4 h-4"/> Lembrar Pendentes</button>
                                <button onClick={handleAcceptAllJustifications} disabled={!!processingAction} className="flex-1 sm:flex-none flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md text-sm font-semibold disabled:opacity-50"><CheckCircleIcon className="w-4 h-4"/> Aceitar Justificativas</button>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>

            {/* Assignments List */}
            <div className="bg-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Tarefas das Divulgadoras</h2>
                 <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
                     <div className="relative flex-grow w-full">
                        <SearchIcon className="w-5 h-5 text-gray-400 absolute top-1/2 left-3 -translate-y-1/2" />
                        <input type="text" placeholder="Buscar por nome ou @" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-dark rounded-md border border-gray-600 focus:ring-primary focus:border-primary" />
                    </div>
                     <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg w-full md:w-auto overflow-x-auto">
                        {(['all', 'pending', 'confirmed', 'completed', 'justification'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 px-3 py-1.5 text-sm rounded-md transition-colors ${filter === f ? 'bg-primary' : 'hover:bg-gray-700'}`}>
                                { {all: 'Todas', pending: 'Pendentes', confirmed: 'Confirmadas', completed: 'Concluídas', justification: 'Justificativas'}[f] } ({counts[f]})
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                     {filteredAssignments.map(assignment => {
                        const promoter = promotersMap.get(assignment.promoterId);
                        return (
                            <div key={assignment.id} className="bg-dark/80 p-4 rounded-lg border border-gray-700/50">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                    <div className="flex items-center gap-4">
                                        {promoter?.photoUrls?.[0] && (
                                            <img src={promoter.photoUrls[0]} alt={assignment.promoterName} className="w-12 h-12 object-cover rounded-full flex-shrink-0" />
                                        )}
                                        <div>
                                            <p className={`font-bold text-lg ${getPerformanceColor(assignment.completionRate)}`}>{assignment.promoterName}</p>
                                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                                <a href={`https://instagram.com/${promoter?.instagram?.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><InstagramIcon className="w-4 h-4"/> <span>{promoter?.instagram || 'N/A'}</span></a>
                                                <a href={`https://wa.me/55${promoter?.whatsapp?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-green-400"><WhatsAppIcon className="w-4 h-4"/></a>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 flex flex-col items-start sm:items-end gap-2">
                                        <div>
                                            {assignment.justification ? getJustificationStatusBadge(assignment.justificationStatus) : 
                                            assignment.proofSubmittedAt ? <span className="px-2 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">Concluído</span> :
                                            assignment.status === 'confirmed' ? <span className="px-2 text-xs font-semibold rounded-full bg-blue-900/50 text-blue-300">Confirmado</span> :
                                            <span className="px-2 text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
                                            }
                                        </div>
                                        <p className="font-bold text-blue-400 text-lg">{assignment.completionRate >= 0 ? `${assignment.completionRate}%` : 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-gray-700/50 pt-3">
                                    <div className="flex-grow w-full md:w-auto">
                                        {(assignment.proofImageUrls && assignment.proofImageUrls.length > 0) || assignment.justification ? (
                                            <div onClick={() => handleOpenStatusModal(assignment)} className="bg-gray-800/50 p-2 rounded-md flex items-center gap-3 cursor-pointer hover:bg-gray-800/80">
                                                {assignment.proofImageUrls && assignment.proofImageUrls.length > 0 && assignment.proofImageUrls[0] !== 'manual' ? (
                                                    assignment.proofImageUrls.map((url, i) => (
                                                        <img key={i} src={url} className="w-12 h-12 object-cover rounded-md" alt={`Prova ${i + 1}`} />
                                                    ))
                                                ) : assignment.justification ? (
                                                    <>
                                                        <p className="text-yellow-300 text-sm font-semibold">Justificativa</p>
                                                        <p className="text-xs text-gray-400 italic line-clamp-2">"{assignment.justification}"</p>
                                                    </>
                                                ) : <p className="text-sm text-gray-400">Completado Manualmente</p>}
                                            </div>
                                        ) : <div className="text-center text-xs text-gray-500 h-full flex items-center justify-center">Aguardando ação da divulgadora.</div>}
                                    </div>
                                    <div className="flex-shrink-0 flex gap-2 w-full md:w-auto">
                                        <button onClick={() => handleOpenStatsModal(assignment.promoterId)} className="flex-1 text-center text-sm py-2 px-3 bg-gray-600 rounded-md hover:bg-gray-500">Ver Stats</button>
                                        <button onClick={() => handleOpenStatusModal(assignment)} className="flex-1 text-center text-sm py-2 px-3 bg-primary rounded-md hover:bg-primary-dark">Analisar</button>
                                    </div>
                                </div>
                            </div>
                        )
                     })}
                     {filteredAssignments.length === 0 && <p className="text-gray-400 text-center col-span-full py-8">Nenhuma tarefa encontrada com os filtros atuais.</p>}
                </div>
            </div>

            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <ChangeAssignmentStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} assignment={selectedAssignment} onSave={handleSaveAssignmentStatus} />
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedPromoter} />
        </div>
    );
};