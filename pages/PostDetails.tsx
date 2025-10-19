import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostWithAssignments, deletePost, updatePost, sendPostReminder, removePromoterFromPostAndGroup, sendSinglePostReminder } from '../services/postService';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import AssignPostModal from '../components/AssignPostModal';
import EditPostModal from '../components/EditPostModal'; // Import new modal
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAdminAuth } from '../contexts/AdminAuthContext';
// FIX: Removed modular signOut import to use compat syntax.
import { auth } from '../firebase/config';


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
                setTimeLeft('Tempo esgotado');
                setTextColor('text-red-400');
                return false; // stop timer
            }

            if (now < enableTime) {
                const diff = enableTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`Envio liberado em ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setTextColor('text-yellow-400');
            } else {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`Envio expira em ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                // Change color if less than an hour left
                if(diff < 60 * 60 * 1000) {
                    setTextColor('text-orange-400');
                } else {
                    setTextColor('text-gray-400');
                }
            }
            return true; // continue timer
        };

        if (calculateTime()) {
            const timer = setInterval(() => {
                if (!calculateTime()) {
                    clearInterval(timer);
                }
            }, 1000);
            return () => clearInterval(timer);
        }

    }, [assignment]);

    if (!timeLeft) {
        return null;
    }

    return (
        <div className={`text-xs font-mono mt-1 ${textColor}`}>
            {timeLeft}
        </div>
    );
};

// FIX: Changed to a named export to resolve a module resolution error.
export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [filterQuery, setFilterQuery] = useState('');
    
    // Edit state
    const [isActive, setIsActive] = useState(false);
    const [expiresAt, setExpiresAt] = useState('');

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
    const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);


    // Stats Modal State
    const [statsModalOpen, setStatsModalOpen] = useState(false);
    const [selectedPromoter, setSelectedPromoter] = useState<PostAssignment | null>(null);

    // Assign Modal State
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const fetchDetails = async () => {
        if (!postId) {
            setError("ID da publicação não encontrado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const { post, assignments } = await getPostWithAssignments(postId);
            setPost(post);
            setIsActive(post.isActive);
            setExpiresAt(timestampToInputDate(post.expiresAt));
            setAssignments(assignments.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();
    }, [postId]);
    
    const handleLogout = async () => {
        try {
            // FIX: Use compat signOut method.
            await auth.signOut();
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const showSuccessMessage = (message: string) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

    const handleOpenStatsModal = (promoterAssignment: PostAssignment) => {
        setSelectedPromoter(promoterAssignment);
        setStatsModalOpen(true);
    };

    const handleSaveChanges = async () => {
        if (!postId) return;
        setIsSaving(true);
        setError(null);
        try {
            let expiryTimestamp: Timestamp | null = null;
            if (expiresAt) {
                const [year, month, day] = expiresAt.split('-').map(Number);
                const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
                expiryTimestamp = Timestamp.fromDate(expiryDate);
            }
            
            const updateData: Partial<Post> = {
                isActive,
                expiresAt: expiryTimestamp,
            };

            await updatePost(postId, updateData);
            showSuccessMessage('Publicação atualizada com sucesso!');
            await fetchDetails(); // Refresh data to confirm changes
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveContent = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!postId) return;
        setIsSaving(true);
        setError(null);
        try {
            let dataToUpdate: Partial<Post> = { ...updatedData };
    
            if (newMediaFile) {
                const fileExtension = newMediaFile.name.split('.').pop();
                const fileName = `posts-media/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = ref(storage, fileName);
                await uploadBytes(storageRef, newMediaFile);
                const finalMediaUrl = await getDownloadURL(storageRef);
                dataToUpdate.mediaUrl = finalMediaUrl;
            }
    
            await updatePost(postId, dataToUpdate);
            
            showSuccessMessage('Conteúdo da publicação atualizado com sucesso!');
            await fetchDetails();
            setIsEditModalOpen(false);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };


    const handleDelete = async () => {
        if (!postId || !post) return;
        if (window.confirm(`Tem certeza que deseja deletar a publicação para "${post.campaignName}"? Esta ação é irreversível.`)) {
            setIsDeleting(true);
            try {
                await deletePost(postId);
                alert("Publicação deletada com sucesso.");
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    const handleDuplicate = () => {
        if (!postId) return;
        navigate(`/admin/posts/new?fromPost=${postId}`);
    };

    const handleSendReminder = async () => {
        if (!postId) return;
        
        const pendingCount = assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt).length;
        if (pendingCount === 0) return;

        if (window.confirm(`Isso enviará um e-mail de lembrete para ${pendingCount} divulgadora(s) que ainda não enviaram a comprovação. Deseja continuar?`)) {
            setIsSendingReminder(true);
            setError(null);
            try {
                const result = await sendPostReminder(postId);
                showSuccessMessage(result.message || `${result.count} lembretes enviados.`);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsSendingReminder(false);
            }
        }
    };

     const handleSendSingleReminder = async (assignmentId: string, promoterName: string) => {
        if (!window.confirm(`Enviar um lembrete manual para ${promoterName}?`)) return;

        setSendingReminderId(assignmentId);
        setError(null);
        try {
            const result = await sendSinglePostReminder(assignmentId);
            showSuccessMessage(result.message);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSendingReminderId(null);
        }
    };

    const handleRemoveFromGroup = async (assignment: PostAssignment) => {
        if (window.confirm(`Tem certeza que deseja marcar "${assignment.promoterName}" como fora do grupo e removê-la desta publicação? A divulgadora não aparecerá mais nas listas de atribuição de posts.`)) {
            setIsSaving(true);
            setError(null);
            try {
                await removePromoterFromPostAndGroup(assignment.id, assignment.promoterId);
                showSuccessMessage(`${assignment.promoterName} foi removida com sucesso.`);
                await fetchDetails();
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsSaving(false);
            }
        }
    };

    const pendingProofCount = useMemo(() => {
        return assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt).length;
    }, [assignments]);

    const filteredAssignments = useMemo(() => {
        if (!filterQuery.trim()) {
            return assignments;
        }
        const lowercasedQuery = filterQuery.toLowerCase();
        return assignments.filter(a => 
            a.promoterName.toLowerCase().includes(lowercasedQuery)
        );
    }, [assignments, filterQuery]);


    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        let date;
        // Handle Firestore Timestamp object from SDK
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (typeof timestamp === 'object' && (timestamp.seconds || timestamp._seconds)) {
            // Handle serialized Timestamp from cloud function or from malformed db entry
            const seconds = timestamp.seconds || timestamp._seconds;
            date = new Date(seconds * 1000);
        } else {
            // Handle string date
            date = new Date(timestamp);
        }
        if (isNaN(date.getTime())) return 'Data inválida';
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const confirmationStats = {
        confirmed: assignments.filter(a => a.status === 'confirmed').length,
        proofs: assignments.filter(a => a.proofSubmittedAt).length,
        total: assignments.length,
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center py-10">Carregando detalhes...</div>;
        if (error && !post) return <div className="text-red-400 text-center py-10">{error}</div>;
        if (!post) return <div className="text-center py-10">Publicação não encontrada.</div>;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Post Info */}
                <div className="lg:col-span-1 bg-dark/70 p-4 rounded-lg self-start">
                    <h2 className="text-xl font-bold text-primary mb-4">{post.campaignName}</h2>
                    {post.type === 'image' && post.mediaUrl && (
                        <a href={post.mediaUrl} target="_blank" rel="noopener noreferrer">
                             <img src={post.mediaUrl} alt="Arte da publicação" className="w-full rounded-md mb-4" />
                        </a>
                    )}
                    {post.type === 'video' && post.mediaUrl && (
                        <video src={post.mediaUrl} controls className="w-full rounded-md mb-4" />
                    )}
                    {post.type === 'text' && (
                        <div className="bg-gray-800 p-3 rounded-md mb-4">
                            <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{post.textContent}</pre>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold text-gray-200">Instruções:</h4>
                        <p className="text-gray-400 text-sm whitespace-pre-wrap">{post.instructions}</p>
                    </div>
                    {post.postLink && (
                        <div className="mt-2">
                            <h4 className="font-semibold text-gray-200">Link do Post:</h4>
                            <a href={post.postLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline break-all">{post.postLink}</a>
                        </div>
                    )}
                    <div className="mt-4 border-t border-gray-600 pt-4">
                        <p className="text-xs text-gray-500">Criado por: {post.createdByEmail}</p>
                        <p className="text-xs text-gray-500">Em: {formatDate(post.createdAt)}</p>
                    </div>

                    <div className="mt-4 border-t border-gray-600 pt-4 space-y-4">
                        <h4 className="font-semibold text-gray-200">Gerenciamento Rápido</h4>
                        <div className="space-y-4 p-3 border border-gray-600 rounded-md">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                                <span>Post Ativo</span>
                            </label>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Data Limite (opcional)</label>
                                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                            </div>
                            <button onClick={handleSaveChanges} disabled={isSaving} className="w-full px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                                {isSaving ? 'Salvando...' : 'Salvar Status/Data'}
                            </button>
                        </div>
                    </div>
                     <div className="mt-4 border-t border-gray-600 pt-4 space-y-2">
                        <h4 className="font-semibold text-gray-200">Ações do Post</h4>
                         <button onClick={() => setIsEditModalOpen(true)} disabled={isSaving || isDeleting} className="w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-50">
                            Editar Conteúdo e Instruções
                        </button>
                        <button onClick={handleDuplicate} disabled={isSaving || isDeleting} className="w-full px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-500 disabled:opacity-50">
                            Duplicar Post
                        </button>
                        <button onClick={handleDelete} disabled={isDeleting || isSaving} className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:opacity-50">
                            {isDeleting ? 'Deletando...' : 'Deletar Publicação'}
                        </button>
                    </div>
                </div>

                {/* Assignments List */}
                <div className="lg:col-span-2 bg-dark/70 p-4 rounded-lg">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-white">Divulgadoras Atribuídas</h2>
                             <div className="flex items-center gap-4 text-sm mt-1">
                                <span className="text-gray-400">Total: <span className="font-bold text-white">{confirmationStats.total}</span></span>
                                <span className="text-gray-400">Confirmaram: <span className="font-bold text-green-400">{confirmationStats.confirmed}</span></span>
                                <span className="text-gray-400">Comprovaram: <span className="font-bold text-blue-400">{confirmationStats.proofs}</span></span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                             <button onClick={() => setIsAssignModalOpen(true)} className="px-3 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark text-sm">
                                + Atribuir a Mais
                            </button>
                            <button onClick={handleSendReminder} disabled={isSendingReminder || pendingProofCount === 0} className="px-3 py-2 bg-yellow-600 text-white font-semibold rounded-md hover:bg-yellow-700 text-sm disabled:opacity-50">
                                {isSendingReminder ? 'Enviando...' : `Lembrete (${pendingProofCount})`}
                            </button>
                        </div>
                    </div>

                    <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)} placeholder="Filtrar por nome..." className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 mb-4" />

                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        {filteredAssignments.map(a => {
                            const hasConfirmed = a.status === 'confirmed';
                            const hasProof = a.proofSubmittedAt;
                            return (
                                <div key={a.id} className="bg-gray-800/50 p-3 rounded-md">
                                    <div className="flex flex-col sm:flex-row justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-white">{a.promoterName}</p>
                                            <p className="text-sm text-gray-400">{a.promoterEmail}</p>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2 sm:mt-0 flex-shrink-0">
                                            {hasProof ? (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-900/50 text-blue-300">Comprovado</span>
                                            ) : hasConfirmed ? (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="min-h-[16px]">
                                        <ProofTimer assignment={a} />
                                    </div>

                                    {hasProof && a.proofImageUrls && (
                                        <div className="mt-3 border-t border-gray-700 pt-3">
                                            <p className="text-xs font-semibold text-gray-400 mb-2">Comprovação:</p>
                                            <div className="flex gap-2">
                                                {a.proofImageUrls.map((url, i) => (
                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                        <img src={url} alt={`Prova ${i+1}`} className="w-16 h-16 object-cover rounded" />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                     <div className="mt-3 border-t border-gray-700 pt-2 flex justify-end gap-4 text-sm font-medium relative z-10">
                                        {!hasProof && hasConfirmed && (
                                            <button
                                                onClick={() => handleSendSingleReminder(a.id, a.promoterName)}
                                                disabled={sendingReminderId === a.id}
                                                className="text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 disabled:cursor-wait"
                                            >
                                                {sendingReminderId === a.id ? 'Enviando...' : 'Lembrete Manual'}
                                            </button>
                                        )}
                                        <button onClick={() => handleOpenStatsModal(a)} className="text-indigo-400 hover:text-indigo-300">Ver Stats</button>
                                        <button onClick={() => handleRemoveFromGroup(a)} className="text-red-400 hover:text-red-300">Remover do Grupo</button>
                                    </div>
                                </div>
                            );
                        })}
                        {filteredAssignments.length === 0 && <p className="text-gray-400 text-center py-4">Nenhuma divulgadora encontrada.</p>}
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                     <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Todas as Publicações</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Detalhes da Publicação</h1>
                </div>
                 {adminData?.role === 'poster' && (
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                        Sair
                    </button>
                )}
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
                 {successMessage && <div className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4 text-sm font-semibold">{successMessage}</div>}
                {renderContent()}
            </div>

            {statsModalOpen && selectedPromoter && (
                <PromoterPostStatsModal
                    isOpen={statsModalOpen}
                    onClose={() => setStatsModalOpen(false)}
                    promoter={selectedPromoter}
                />
            )}
            
            {isAssignModalOpen && post && (
                <AssignPostModal 
                    isOpen={isAssignModalOpen}
                    onClose={() => setIsAssignModalOpen(false)}
                    post={post}
                    existingAssignments={assignments}
                    onSuccess={fetchDetails}
                />
            )}
            
            {isEditModalOpen && post && (
                <EditPostModal 
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    post={post}
                    onSave={handleSaveContent}
                />
            )}
        </div>
    );
};
