import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostWithAssignments, deletePost, updatePost, sendPostReminder, removePromoterFromPostAndGroup, sendSinglePostReminder, renewAssignmentDeadline, updateAssignment } from '../services/postService';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon, DownloadIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import AssignPostModal from '../components/AssignPostModal';
import EditPostModal from '../components/EditPostModal'; // Import new modal
import { storage } from '../firebase/config';
// FIX: Import 'uploadBytes' to handle file uploads.
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { useAdminAuth } from '../contexts/AdminAuthContext';
// FIX: Removed modular signOut import to use compat syntax.
import { auth } from '../firebase/config';
import StorageMedia from '../components/StorageMedia';

// Helper to extract Google Drive file ID from various URL formats
const extractGoogleDriveId = (url: string): string | null => {
    let id = null;
    const patterns = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            id = match[1];
            break;
        }
    }
    return id;
};

const timestampToInputDate = (ts: Timestamp | undefined | null | any): string => {
    if (!ts) return '';
    let date;
    // Handle Firestore Timestamp object from SDK
    if (ts.toDate) {
        date = ts.toDate();
    }
    // Handle serialized Timestamp from cloud function or from malformed db entry
    else if (typeof ts === 'object' && (ts.seconds || ts._seconds)) {
        const seconds = ts.seconds || ts._seconds;
        date = new Date(seconds * 1000);
    }
    // Handle string date
    else {
        date = new Date(ts);
    }
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

const ProofTimer: React.FC<{ assignment: PostAssignment }> = ({ assignment }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [textColor, setTextColor] = useState('text-gray-400');

    useEffect(() => {
        // Only run timer for confirmed posts without proof
        if (assignment.status !== 'confirmed' || !!assignment.proofSubmittedAt || !assignment.confirmedAt) {
            setTimeLeft('');
            return;
        }

        const confirmationTime = (assignment.confirmedAt as Timestamp).toDate();
        const enableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000); // 6 hours
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        const calculateTime = () => {
            const now = new Date();

            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) {
                    setTimeLeft('Envio fora do prazo liberado');
                    setTextColor('text-green-400');
                } else {
                    setTimeLeft('Tempo esgotado');
                    setTextColor('text-red-400');
                }
                return false; // stop timer
            }

            if (now < enableTime) {
                const diff = enableTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setTimeLeft(`Envio libera em ${hours}h ${minutes}m`);
                setTextColor('text-blue-400');
            } else {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setTimeLeft(`Expira em ${hours}h ${minutes}m`);
                setTextColor(hours < 4 ? 'text-yellow-400' : 'text-gray-400');
            }
            return true; // continue timer
        };

        if (calculateTime()) {
            const timer = setInterval(() => {
                if (!calculateTime()) {
                    clearInterval(timer);
                }
            }, 60000); // Update every minute

            return () => clearInterval(timer);
        }
    }, [assignment]);

    if (!timeLeft) return null;

    return (
        <p className={`text-xs font-semibold ${textColor}`}>{timeLeft}</p>
    );
};


const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed'>('all');
    const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, completed: 0 });
    const [isDownloading, setIsDownloading] = useState(false);

    // Modal states
    const [isStatsModalOpen, setStatsModalOpen] = useState(false);
    const [selectedPromoterForStats, setSelectedPromoterForStats] = useState<PostAssignment | null>(null);
    const [isAssignModalOpen, setAssignModalOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // For single-actions like reminders

    const fetchData = async () => {
        if (!postId) return;
        setIsLoading(true);
        try {
            const { post: postData, assignments: assignmentsData } = await getPostWithAssignments(postId);
            setPost(postData);
            setAssignments(assignmentsData.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
    }, [postId]);

    useEffect(() => {
        const total = assignments.length;
        const pending = assignments.filter(a => a.status === 'pending').length;
        const confirmed = assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt).length;
        const completed = assignments.filter(a => !!a.proofSubmittedAt).length;
        setStats({ total, pending, confirmed, completed });
    }, [assignments]);
    
    const handleLogout = async () => {
        try {
            // FIX: Use compat signOut method.
            await auth.signOut();
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const filteredAssignments = useMemo(() => {
        switch (filter) {
            case 'pending': return assignments.filter(a => a.status === 'pending');
            case 'confirmed': return assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt);
            case 'completed': return assignments.filter(a => !!a.proofSubmittedAt);
            default: return assignments;
        }
    }, [filter, assignments]);

    const handleOpenStatsModal = (assignment: PostAssignment) => {
        setSelectedPromoterForStats(assignment);
        setStatsModalOpen(true);
    };
    
    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        setError('');
        try {
            let finalUpdateData = { ...updatedData };
            // If new media is uploaded (only for images now), upload it and get URL
            if (newMediaFile) {
                const fileExtension = newMediaFile.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = ref(storage, `posts-media/${fileName}`);
                await uploadBytes(storageRef, newMediaFile);
                finalUpdateData.mediaUrl = storageRef.fullPath;
            }
            await updatePost(post.id, finalUpdateData);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar a publicação.');
            throw err; // Re-throw to keep modal state
        }
    };
    
    const handleDelete = async () => {
        if (!post) return;
        if (window.confirm("Tem certeza que deseja excluir esta publicação e todas as suas atribuições? Esta ação não pode ser desfeita.")) {
            try {
                await deletePost(post.id);
                alert("Publicação excluída com sucesso.");
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message);
            }
        }
    };
    
    const handleSendReminders = async () => {
        if (!post) return;
        if (window.confirm("Isso enviará um lembrete para TODAS as divulgadoras que confirmaram a postagem mas ainda não enviaram a comprovação. Deseja continuar?")) {
            setIsProcessing('global-reminder');
            setError('');
            try {
                const result = await sendPostReminder(post.id);
                alert(result.message);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleSingleReminder = async (assignment: PostAssignment) => {
        setIsProcessing(`single-reminder-${assignment.id}`);
        setError('');
        try {
            const result = await sendSinglePostReminder(assignment.id);
            alert(result.message);
            await fetchData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(null);
        }
    };
    
    const handleRemovePromoter = async (assignment: PostAssignment) => {
        if (window.confirm(`Tem certeza que deseja remover ${assignment.promoterName} desta publicação e marcar como 'fora do grupo'? Ação irreversível.`)) {
            setIsProcessing(`remove-${assignment.id}`);
            setError('');
            try {
                await removePromoterFromPostAndGroup(assignment.id, assignment.promoterId);
                await fetchData();
            } catch(err: any) {
                setError(err.message);
            } finally {
                 setIsProcessing(null);
            }
        }
    };

    const handleRenewDeadline = async (assignment: PostAssignment) => {
        if (window.confirm(`Isso irá resetar o prazo de 24 horas para ${assignment.promoterName} enviar a comprovação, a partir de agora. Deseja continuar?`)) {
            setIsProcessing(`renew-${assignment.id}`);
            setError('');
            try {
                await renewAssignmentDeadline(assignment.id);
                await fetchData();
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsProcessing(null);
            }
        }
    };

    const handleJustification = async (status: 'accepted' | 'rejected', assignmentId: string) => {
        setIsProcessing(`justification-${assignmentId}`);
        try {
            await updateAssignment(assignmentId, { justificationStatus: status });
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao atualizar justificativa.');
        } finally {
            setIsProcessing(null);
        }
    };

    const renderJustificationStatus = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => {
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            accepted: "bg-green-900/50 text-green-300",
            rejected: "bg-red-900/50 text-red-300",
        };
        const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" };
        if (!status) return null;
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    const handleDownload = (mediaUrl: string, campaignName: string, type: 'image' | 'video') => {
        setIsDownloading(true);
        setError('');
        try {
            let downloadUrl = mediaUrl;

            if (type === 'video' && mediaUrl.includes('drive.google.com')) {
                const fileId = extractGoogleDriveId(mediaUrl);
                if (!fileId) throw new Error('ID do arquivo do Google Drive não encontrado no link.');
                downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            } else if (type === 'image') {
                // For images from Firebase Storage, we still need to get the download URL
                const imageRef = ref(storage, mediaUrl);
                getDownloadURL(imageRef).then(url => {
                    triggerDownload(url, campaignName, type);
                }).catch(err => {
                    throw new Error("Não foi possível obter o link de download da imagem.");
                });
                return; // The promise will handle the rest
            } else {
                 throw new Error("Tipo de mídia não suportado para download direto.");
            }

            triggerDownload(downloadUrl, campaignName, type);

        } catch (error: any) {
            console.error('Download failed:', error);
            alert(`Não foi possível iniciar o download: ${error.message}`);
        } finally {
            setIsDownloading(false);
        }
    };

    const triggerDownload = (url: string, campaignName: string, type: 'image' | 'video') => {
        const safeCampaignName = campaignName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `${type}_${safeCampaignName}.${type === 'video' ? 'mp4' : 'jpg'}`;

        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        link.setAttribute('target', '_blank'); // Good fallback
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center py-10">Carregando...</div>;
        if (error && !post) return <div className="text-red-400 text-center py-10">{error}</div>;
        if (!post) return <div className="text-center text-gray-400 py-10">Publicação não encontrada.</div>;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Post Info */}
                <div className="lg:col-span-1 bg-dark/70 p-4 rounded-lg flex flex-col h-full">
                    <h2 className="font-bold text-lg text-primary">{post.campaignName}</h2>
                    {post.postFormats && post.postFormats.length > 0 && (
                        <div className="flex gap-2 mt-1">
                            {post.postFormats.map(format => (
                                <span key={format} className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-600 text-gray-200 capitalize">
                                    {format}
                                </span>
                            ))}
                        </div>
                    )}
                     <p className="text-sm text-gray-400 my-2">Criado em: {new Date((post.createdAt as Timestamp).seconds * 1000).toLocaleDateString('pt-BR')}</p>

                    {(post.type === 'image' || post.type === 'video') && post.mediaUrl ? (
                        <div className="mb-4">
                            <StorageMedia path={post.mediaUrl} type={post.type} className="w-full max-w-sm mx-auto rounded-md" controls={post.type === 'video'} />
                            <div className="flex justify-center items-center gap-4 mt-2">
                                <button
                                    onClick={() => handleDownload(post.mediaUrl!, post.campaignName, post.type)}
                                    disabled={isDownloading}
                                    className="text-sm text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    {isDownloading ? 'Baixando...' : `Baixar ${post.type === 'video' ? 'Vídeo' : 'Imagem'}`}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {post.type === 'text' && (
                        <div className="bg-gray-800 p-3 rounded-md mb-4">
                            <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{post.textContent}</pre>
                        </div>
                    )}

                    <div className="space-y-2 flex-grow">
                        <h4 className="font-semibold text-gray-200">Instruções:</h4>
                        <div className="bg-gray-800/50 p-3 rounded-md flex-grow">
                            <p className="text-gray-300 text-sm whitespace-pre-wrap">{post.instructions}</p>
                        </div>
                    </div>
                    <div className="mt-4 border-t border-gray-700 pt-4 flex flex-wrap gap-2 justify-center">
                        <button onClick={() => setEditModalOpen(true)} className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm">Editar Conteúdo</button>
                        <button onClick={() => navigate(`/admin/posts/new?fromPost=${post.id}`)} className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Duplicar</button>
                        <button onClick={handleDelete} className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">Excluir Post</button>
                    </div>
                </div>

                {/* Right Column: Assignments */}
                <div className="lg:col-span-2 bg-dark/70 p-4 rounded-lg">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                         <div className="flex space-x-1 p-1 bg-gray-800/50 rounded-lg">
                            {(['all', 'pending', 'confirmed', 'completed'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                    {{'all': `Todas (${stats.total})`, 'pending': `Pendentes (${stats.pending})`, 'confirmed': `Confirmadas (${stats.confirmed})`, 'completed': `Concluídas (${stats.completed})`}[f]}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleSendReminders} disabled={isProcessing === 'global-reminder'} className="px-3 py-1 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm disabled:opacity-50">Lembrete Geral</button>
                            <button onClick={() => setAssignModalOpen(true)} className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">+ Atribuir</button>
                        </div>
                    </div>
                     {error && <div className="bg-red-900/50 text-red-300 p-2 rounded-md mb-4 text-xs">{error}</div>}
                    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                        {filteredAssignments.map(a => (
                            <div key={a.id} className="bg-gray-800/50 p-3 rounded-md">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-white">{a.promoterName}</p>
                                        <p className="text-xs text-gray-400">{a.promoterEmail}</p>
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                        <p className="text-xs text-gray-500">Status: {a.status}</p>
                                        <ProofTimer assignment={a} />
                                    </div>
                                </div>

                                {a.justification && (
                                    <div className="mt-2 pt-2 border-t border-gray-700/50">
                                        <p className="text-xs font-semibold text-yellow-300">Justificativa Enviada:</p>
                                        <p className="text-sm text-gray-300 italic bg-gray-900/50 p-2 rounded-md my-1">{a.justification}</p>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs flex items-center gap-2">Status: {renderJustificationStatus(a.justificationStatus)}</div>
                                            {a.justificationStatus === 'pending' && (
                                                <div className="flex gap-2 text-xs font-semibold">
                                                    <button onClick={() => handleJustification('accepted', a.id)} disabled={isProcessing === `justification-${a.id}`} className="text-green-400 hover:underline disabled:opacity-50">Aceitar</button>
                                                    <button onClick={() => handleJustification('rejected', a.id)} disabled={isProcessing === `justification-${a.id}`} className="text-red-400 hover:underline disabled:opacity-50">Rejeitar</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-2 pt-2 border-t border-gray-700/50 flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        {a.proofImageUrls && a.proofImageUrls.length > 0 ? (
                                            a.proofImageUrls.map((url, i) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                    <img src={url} alt={`Prova ${i+1}`} className="w-10 h-10 object-cover rounded"/>
                                                </a>
                                            ))
                                        ) : !a.justification && (
                                            <p className="text-xs text-gray-500">Aguardando comprovação...</p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                                        <button onClick={() => handleOpenStatsModal(a)} className="text-blue-400 hover:underline">Estatísticas</button>
                                        {a.status === 'confirmed' && !a.proofSubmittedAt && <button onClick={() => handleSingleReminder(a)} disabled={isProcessing === `single-reminder-${a.id}`} className="text-yellow-400 hover:underline disabled:opacity-50">Lembrete</button>}
                                        {a.status === 'confirmed' && !a.proofSubmittedAt && <button onClick={() => handleRenewDeadline(a)} disabled={isProcessing === `renew-${a.id}`} className="text-green-400 hover:underline disabled:opacity-50">Renovar Prazo</button>}
                                        <button onClick={() => handleRemovePromoter(a)} disabled={isProcessing === `remove-${a.id}`} className="text-red-400 hover:underline disabled:opacity-50">Remover</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                         {filteredAssignments.length === 0 && <p className="text-center text-gray-500 py-6">Nenhuma atribuição encontrada para este filtro.</p>}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div>
             <div className="flex justify-between items-center mb-6">
                 <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar</span>
                </button>
                 {adminData?.role === 'poster' && (
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                        Sair
                    </button>
                )}
            </div>
             <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
             </div>
             <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setStatsModalOpen(false)} promoter={selectedPromoterForStats} />
             <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
             <EditPostModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} post={post} onSave={handleSavePost} />
        </div>
    );
};

export default PostDetails;
