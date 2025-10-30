
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment, Promoter, Timestamp } from '../types';
import { getPostWithAssignments, updatePost, deletePost, sendPostReminder, sendSinglePostReminder, updateAssignment, acceptAllJustifications, renewAssignmentDeadline } from '../services/postService';
import { getPromotersByIds } from '../services/promoterService';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, PencilIcon, TrashIcon, UserPlusIcon, EnvelopeIcon, ChartBarIcon, MegaphoneIcon, CheckCircleIcon, InstagramIcon, ClockIcon, DownloadIcon, DuplicateIcon } from '../components/Icons';
import StorageMedia from '../components/StorageMedia';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import { storage, functions } from '../firebase/config';


const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type AssignmentStatusFilter = 'all' | 'pending' | 'confirmed' | 'completed' | 'justified';
type AssignmentWithPromoter = PostAssignment & { promoterDetails?: Promoter };


const ProofCountdownTimer: React.FC<{ confirmedAt: any; allowLateSubmissions: boolean }> = ({ confirmedAt, allowLateSubmissions }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const confirmationTime = confirmedAt?.toDate ? confirmedAt.toDate() : new Date(confirmedAt);
        if (isNaN(confirmationTime.getTime())) return;

        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        const updateTimer = () => {
            const now = new Date();
            const difference = expireTime.getTime() - now.getTime();

            if (difference > 0) {
                const hours = Math.floor(difference / (1000 * 60 * 60));
                const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((difference / 1000) % 60);
                setTimeLeft(`${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`);
                setIsExpired(false);
            } else {
                setTimeLeft(allowLateSubmissions ? 'Prazo encerrado (envio tardio liberado)' : 'Prazo encerrado');
                setIsExpired(true);
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);

        return () => clearInterval(timer);
    }, [confirmedAt, allowLateSubmissions]);

    if (!timeLeft) return null;

    return (
        <div className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isExpired ? 'text-red-400' : 'text-yellow-300'}`}>
            <ClockIcon className="w-3 h-3"/>
            {timeLeft}
        </div>
    );
};

const PhotoViewerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    imageUrls: string[];
    startIndex: number;
}> = ({ isOpen, onClose, imageUrls, startIndex }) => {
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const [downloadableUrl, setDownloadableUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(startIndex);
        }
    }, [isOpen, startIndex]);

    // Effect to generate a fresh, valid URL for the current image
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        setDownloadableUrl(null); // Reset on image change

        const generateUrl = async () => {
            const originalUrl = imageUrls[currentIndex];
            if (!originalUrl) return;

            // Simple check if it's a blob or http URL.
            if (originalUrl.startsWith('http') || originalUrl.startsWith('blob:')) {
                 if (isMounted) setDownloadableUrl(originalUrl);
            } else {
                // Otherwise, assume it's a Firebase Storage path.
                 try {
                    const storageRef = storage.ref(originalUrl);
                    const freshUrl = await storageRef.getDownloadURL();
                    if (isMounted) setDownloadableUrl(freshUrl);
                } catch (e) {
                    console.warn("Could not generate a fresh download URL, falling back to original URL.", e);
                    // This might fail if it's already a full URL that doesn't start with http, which is unlikely.
                    if (isMounted) setDownloadableUrl(originalUrl);
                }
            }
        };
        generateUrl();
        return () => { isMounted = false; };
    }, [isOpen, currentIndex, imageUrls]);

    const goToPrevious = (e: React.MouseEvent) => {
        e.stopPropagation();
        const isFirst = currentIndex === 0;
        const newIndex = isFirst ? imageUrls.length - 1 : currentIndex - 1;
        setCurrentIndex(newIndex);
    };

    const goToNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        const isLast = currentIndex === imageUrls.length - 1;
        const newIndex = isLast ? 0 : currentIndex + 1;
        setCurrentIndex(newIndex);
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isOpen) return;
        if (e.key === 'ArrowRight') goToNext(e as any);
        else if (e.key === 'ArrowLeft') goToPrevious(e as any);
        else if (e.key === 'Escape') onClose();
    }, [isOpen, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    if (!isOpen) return null;

    const hasMultipleImages = imageUrls.length > 1;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-2" onClick={onClose} role="dialog" aria-modal="true">
            <div className="relative w-full max-w-2xl max-h-[95vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {/* Image Area */}
                <div className="relative w-full flex-grow min-h-0 flex items-center justify-center">
                    <img src={imageUrls[currentIndex]} alt={`Visualização ${currentIndex + 1}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"/>
                </div>
                
                {/* Bottom Control Bar */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    {hasMultipleImages && (
                        <p className="text-center text-white text-sm font-mono mb-2">{currentIndex + 1} / {imageUrls.length}</p>
                    )}
                    <div className="flex items-center justify-center gap-4 sm:gap-6 text-white">
                        <button onClick={goToPrevious} disabled={!hasMultipleImages} className="p-2 rounded-full bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <a href={downloadableUrl || '#'} download target="_blank" rel="noopener noreferrer" className={`p-3 rounded-full bg-black/50 hover:bg-black/70 ${!downloadableUrl ? 'opacity-30 cursor-not-allowed' : ''}`} title="Baixar imagem">
                            <DownloadIcon className="h-6 w-6" />
                        </a>
                        <button onClick={onClose} className="px-6 py-2 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 transition-colors">
                            Fechar
                        </button>
                        <a href={imageUrls[currentIndex]} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-black/50 hover:bg-black/70" title="Abrir em nova aba">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                        <button onClick={goToNext} disabled={!hasMultipleImages} className="p-2 rounded-full bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<AssignmentWithPromoter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [filter, setFilter] = useState<AssignmentStatusFilter>('all');

    // Modals state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isChangeStatusModalOpen, setIsChangeStatusModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithPromoter | null>(null);

    // Photo viewer modal state
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);

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
            
            if (assignmentsData.length > 0) {
                const promoterIds = [...new Set(assignmentsData.map(a => a.promoterId))];
                const promoters = await getPromotersByIds(promoterIds);
                const promotersMap = new Map(promoters.map(p => [p.id, p]));

                const assignmentsWithDetails = assignmentsData.map(assignment => ({
                    ...assignment,
                    promoterDetails: promotersMap.get(assignment.promoterId)
                }));
                setAssignments(assignmentsWithDetails.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
            } else {
                setAssignments([]);
            }

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

    const openPhotoViewer = (urls: string[] | undefined, startIndex: number) => {
        if (!urls) return;
        const validUrls = urls.filter(url => url !== 'manual');
        if (validUrls.length === 0) return;

        const clickedUrl = urls[startIndex];
        if (clickedUrl === 'manual') return;
        
        const actualStartIndex = validUrls.indexOf(clickedUrl);
        if (actualStartIndex === -1) return;

        setPhotoViewerUrls(validUrls);
        setPhotoViewerStartIndex(actualStartIndex);
        setIsPhotoViewerOpen(true);
    };
    
    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        
        let finalMediaUrl = updatedData.mediaUrl;
        if (newMediaFile) {
            const fileExtension = newMediaFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = storage.ref(`posts-media/${fileName}`);
            const uploadResult = await storageRef.put(newMediaFile);
            finalMediaUrl = uploadResult.ref.fullPath;
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
                const func = functions.httpsCallable('sendPostReminder');
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
    
    const handleRenewDeadline = async (assignmentId: string) => {
        if (!window.confirm("Isso irá resetar o prazo de 24 horas para o envio da comprovação, a partir de agora. Deseja continuar?")) {
            return;
        }
        setIsProcessing(assignmentId + '_renew');
        try {
            await renewAssignmentDeadline(assignmentId);
            await fetchData(); // Refresh data to show new countdown
        } catch(err: any) {
            setError(err.message || "Falha ao renovar prazo.");
        } finally {
            setIsProcessing(null);
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
                            <button onClick={() => navigate(`/admin/posts/new?fromPost=${post.id}`)} className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm"><DuplicateIcon className="w-4 h-4"/> Duplicar</button>
                            <button onClick={() => setIsEditModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"><PencilIcon className="w-4 h-4"/> Editar Conteúdo</button>
                            <button onClick={() => setIsAssignModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"><UserPlusIcon className="w-4 h-4"/> Atribuir a Mais</button>
                            <button onClick={handleDeletePost} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"><TrashIcon className="w-4 h-4"/> Excluir Post</button>
                        </div>
                    )}
                </div>

                <div className="mt-6 border-t border-gray-700 pt-4 space-y-4">
                     {(post.type === 'image' || post.type === 'video') && (post.mediaUrl || post.googleDriveUrl) && (
                         <div className="max-w-sm">
                            <StorageMedia path={post.mediaUrl || post.googleDriveUrl || ''} type={post.type} className="w-full rounded-md" controls={post.type === 'video'}/>
                         </div>
                     )}
                     {post.type === 'text' && (
                         <div className="bg-dark/70 p-3 rounded-md"><pre className="text-gray-300 whitespace-pre-wrap font-sans">{post.textContent}</pre></div>
                     )}
                     <div>
                        <h3 className="font-semibold">Instruções:</h3>
                        <p className="text-gray-300 whitespace-pre-wrap">{post.instructions}</p>
                     </div>
                     {post.googleDriveUrl && (
                        <div>
                            <h3 className="font-semibold">Link Google Drive:</h3>
                            <a href={post.googleDriveUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{post.googleDriveUrl}</a>
                        </div>
                     )}
                     {post.mediaUrl && !post.mediaUrl.includes('drive.google.com') && (
                        <div>
                            <h3 className="font-semibold">Mídia no Servidor (Firebase):</h3>
                            <p className="text-gray-400 text-sm">A mídia principal está hospedada em nosso servidor (geralmente mais rápido para download).</p>
                        </div>
                     )}
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
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4">{error}</div>}
                 <div className="flex flex-wrap gap-2 mb-4">
                    {filterButtons.map(({ label, value, count }) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${filter === value ? 'bg-primary text-white' : 'bg-dark text-gray-300 hover:bg-gray-700'}`}
                        >
                            {label} ({count})
                        </button>
                    ))}
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Comprovação / Justificativa</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredAssignments.map(assignment => (
                                <tr key={assignment.id} className="hover:bg-gray-700/40">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="font-medium text-white">{assignment.promoterName}</div>
                                        <div className="text-xs text-gray-400">{assignment.promoterEmail}</div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {getStatusBadge(assignment)}
                                        {assignment.status === 'confirmed' && !assignment.proofSubmittedAt && !assignment.justification && (
                                            <ProofCountdownTimer confirmedAt={assignment.confirmedAt} allowLateSubmissions={post.allowLateSubmissions ?? false} />
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {assignment.proofImageUrls && assignment.proofImageUrls.length > 0 && (
                                            <div className="flex gap-2">
                                                {assignment.proofImageUrls.map((url, i) => (
                                                    <button key={i} onClick={() => openPhotoViewer(assignment.proofImageUrls, i)} className="focus:outline-none">
                                                        {url === 'manual' ? (
                                                            <div className="w-12 h-12 bg-gray-600 rounded-md flex items-center justify-center text-xs text-center text-gray-300" title="Comprovação manual">Manual</div>
                                                        ) : (
                                                            <img src={url} alt={`Prova ${i+1}`} className="w-12 h-12 object-cover rounded-md" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {assignment.justification && (
                                            <div className="text-xs text-yellow-300 italic truncate" title={assignment.justification}>"{assignment.justification}"</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center gap-3">
                                            <button onClick={() => { setSelectedAssignment(assignment); setIsStatsModalOpen(true); }} className="text-blue-400 hover:text-blue-300" title="Ver estatísticas"><ChartBarIcon className="w-5 h-5"/></button>
                                            {canManage && assignment.status === 'confirmed' && !assignment.proofSubmittedAt && !assignment.justification && (
                                                <button onClick={() => handleSingleReminder(assignment)} disabled={isProcessing === assignment.id} className="text-yellow-400 hover:text-yellow-300 disabled:opacity-50" title="Enviar lembrete"><MegaphoneIcon className="w-5 h-5"/></button>
                                            )}
                                            {canManage && (
                                                <button onClick={() => { setSelectedAssignment(assignment); setIsChangeStatusModalOpen(true); }} className="text-indigo-400 hover:text-indigo-300" title="Alterar status"><PencilIcon className="w-5 h-5"/></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredAssignments.length === 0 && <p className="text-center text-gray-400 py-8">Nenhuma tarefa encontrada com os filtros atuais.</p>}
                </div>
            </div>

            {canManage && post && (
                <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />
            )}
            {canManage && post && (
                <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            )}
            {selectedAssignment && (
                <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} assignment={selectedAssignment} />
            )}
            {canManage && selectedAssignment && (
                <ChangeAssignmentStatusModal isOpen={isChangeStatusModalOpen} onClose={() => setIsChangeStatusModalOpen(false)} assignment={selectedAssignment} onSave={handleUpdateAssignment} />
            )}
            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={photoViewerStartIndex} />
        </div>
    );
};
