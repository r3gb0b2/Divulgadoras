import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment, Promoter, Timestamp } from '../types';
import { getPostWithAssignments, getAssignmentsForOrganization, sendPostReminder, sendSinglePostReminder, updatePost, deletePost, acceptAllJustifications, updateAssignment } from '../services/postService';
import { getPromotersByIds } from '../services/promoterService';
import { ArrowLeftIcon, MegaphoneIcon, PencilIcon, TrashIcon, UserPlusIcon, CheckCircleIcon, SearchIcon, InstagramIcon, WhatsAppIcon } from '../components/Icons';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import StorageMedia from '../components/StorageMedia';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import firebase from 'firebase/compat/app';

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
        const promoterStatsMap = new Map<string, { assigned: number; completed: number; acceptedJustifications: number }>();

        // Calculate stats for all promoters in the organization
        allOrgAssignments.forEach(a => {
            const promoterId = a.promoterId;
            if (!promoterStatsMap.has(promoterId)) {
                promoterStatsMap.set(promoterId, { assigned: 0, completed: 0, acceptedJustifications: 0 });
            }
            const stats = promoterStatsMap.get(promoterId)!;
            stats.assigned++;
            if (a.proofSubmittedAt) stats.completed++;
            if (a.justificationStatus === 'accepted') stats.acceptedJustifications++;
        });

        // Attach completionRate to each assignment for the current post
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
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        return assignmentsWithStats.filter(a => {
            // Filter by search query
            const promoter = promotersMap.get(a.promoterId);
            const matchesSearch = lowercasedQuery === '' ||
                promoter?.name.toLowerCase().includes(lowercasedQuery) ||
                promoter?.email.toLowerCase().includes(lowercasedQuery);

            if (!matchesSearch) return false;

            // Filter by status
            switch (filter) {
                case 'pending': return a.status === 'pending';
                case 'confirmed': return a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification;
                case 'completed': return !!a.proofSubmittedAt;
                case 'justification': return !!a.justification;
                case 'all': default: return true;
            }
        });
    }, [assignmentsWithStats, searchQuery, filter, promotersMap]);

    const handleSendAllReminders = async () => { /* ... existing code ... */ };
    const handleSendSingleReminder = async (assignmentId: string) => { /* ... existing code ... */ };
    const handleAcceptAllJustifications = async () => { /* ... existing code ... */ };
    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => { /* ... existing code ... */ };
    const handleDeletePost = async () => { /* ... existing code ... */ };

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

     const openStatsModal = (promoterId: string) => {
        const promoter = promotersMap.get(promoterId);
        if (promoter) {
            setSelectedPromoter(promoter);
            setIsStatsModalOpen(true);
        }
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
    
    const getStatusBadge = (assignment: PostAssignment) => { /* ... existing code ... */ };

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
                <div className="flex flex-col md:flex-row gap-6 border-b border-gray-700 pb-6 mb-6">
                    <div className="md:w-1/3">
                        <StorageMedia path={post.mediaUrl || post.googleDriveUrl || ''} type={post.type} className="w-full rounded-lg mb-4" />
                        <h1 className="text-2xl font-bold">{post.campaignName}</h1>
                        {post.eventName && <p className="text-lg text-primary">{post.eventName}</p>}
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
                            <button onClick={() => setIsEditModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 rounded-md text-sm"><PencilIcon className="w-4 h-4" />Editar Post</button>
                            <button onClick={() => setIsAssignModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 rounded-md text-sm"><UserPlusIcon className="w-4 h-4" />Atribuir Mais</button>
                            <button onClick={handleSendAllReminders} disabled={processingAction === 'sendAllReminders'} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-md text-sm"><MegaphoneIcon className="w-4 h-4" />Lembrar Todos</button>
                            {stats.pendingJustifications > 0 && 
                                <button onClick={handleAcceptAllJustifications} disabled={processingAction === 'acceptAllJustifications'} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 rounded-md text-sm"><CheckCircleIcon className="w-4 h-4" />Aceitar Justificativas ({stats.pendingJustifications})</button>}
                            <button onClick={handleDeletePost} disabled={!!processingAction} className="flex items-center gap-2 px-3 py-1.5 bg-red-800 rounded-md text-sm"><TrashIcon className="w-4 h-4" />Deletar Post</button>
                        </div>
                    </div>
                </div>

                <h2 className="text-xl font-bold mb-4">Tarefas das Divulgadoras</h2>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="relative flex-grow">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nome ou email..." className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-lg bg-gray-800 text-gray-200" />
                    </div>
                    <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                        {(['all', 'pending', 'confirmed', 'completed', 'justification'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-sm rounded-md ${filter === f ? 'bg-primary' : 'hover:bg-gray-700'}`}>
                                {{'all': 'Todas', 'pending': 'Pendentes', 'confirmed': 'Confirmadas', 'completed': 'Concluídas', 'justification': 'Justificativas'}[f]}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
                
                <div className="space-y-4">
                    {filteredAssignments.length === 0 ? <p className="text-center text-gray-400 py-8">Nenhuma tarefa encontrada com os filtros atuais.</p> : filteredAssignments.map(a => {
                        const promoter = promotersMap.get(a.promoterId);
                        return (
                             <div key={a.id} className="bg-dark/70 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start">
                                {/* Promoter Info */}
                                <div className="w-full md:w-1/3">
                                    <p className={`font-bold text-lg ${getPerformanceColor(a.completionRate)}`}>{promoter?.name || a.promoterName}</p>
                                    <div className="flex items-center gap-4 mt-1">
                                         <a href={`https://instagram.com/${(promoter?.instagram || '').replace('@','')}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline flex items-center text-sm gap-1"><InstagramIcon className="w-4 h-4" /><span>Instagram</span></a>
                                         <a href={`https://wa.me/55${(promoter?.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center text-sm gap-1"><WhatsAppIcon className="w-4 h-4" /><span>WhatsApp</span></a>
                                    </div>
                                     <button onClick={() => openStatsModal(a.promoterId)} className="text-xs text-blue-400 hover:underline mt-1">Ver Stats</button>
                                </div>
                                
                                {/* Status & Proof */}
                                <div className="w-full md:w-2/3 flex flex-col sm:flex-row gap-4">
                                    <div className="flex-1 space-y-2">
                                        <div>{getStatusBadge(a)}</div>
                                        <p className="text-xs text-gray-400">Confirmado em: {formatDate(a.confirmedAt)}</p>
                                        <p className="text-xs text-gray-400">Prova enviada em: {formatDate(a.proofSubmittedAt)}</p>
                                        
                                        {a.justification && (
                                            <div className="text-xs text-yellow-300 bg-yellow-900/30 p-2 rounded cursor-pointer" onClick={() => openStatusModal(a)}>
                                                <strong className="block">Justificativa:</strong>
                                                <p className="italic truncate">"{a.justification}"</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(a.proofImageUrls || []).map((url, i) => (
                                            <img key={i} src={url} alt={`Prova ${i+1}`} className="w-20 h-20 object-cover rounded-md cursor-pointer border-2 border-gray-600 hover:border-primary" onClick={() => openStatusModal(a)} />
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="w-full md:w-auto flex flex-row md:flex-col gap-2 items-stretch justify-end flex-shrink-0">
                                    {a.status === 'confirmed' && !a.proofSubmittedAt && !a.justification && (
                                        <button onClick={() => handleSendSingleReminder(a.id)} disabled={!!processingAction} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md w-full">Lembrar</button>
                                    )}
                                    <button onClick={() => openStatusModal(a)} disabled={!!processingAction} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md w-full">Analisar</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <ChangeAssignmentStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} assignment={selectedAssignment} onSave={handleSaveAssignmentStatus} />
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedPromoter} />
        </div>
    );
};
