import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostWithAssignments, deletePost, updatePost, sendPostReminder } from '../services/postService';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import AssignPostModal from '../components/AssignPostModal';
import EditPostModal from '../components/EditPostModal'; // Import new modal
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';


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

const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    
    // Edit state
    const [isActive, setIsActive] = useState(false);
    const [expiresAt, setExpiresAt] = useState('');

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);
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

    const pendingProofCount = useMemo(() => {
        return assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt).length;
    }, [assignments]);


    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        let date;
        // Handle Firestore Timestamp object from SDK
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (typeof timestamp === 'object' && (timestamp.seconds || timestamp._seconds)) {
            // Handle serialized Timestamp from cloud function OR from malformed db entry
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
                            Duplicar Publicação
                        </button>
                        <button onClick={() => setIsAssignModalOpen(true)} disabled={isSaving || isDeleting} className="w-full px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-500 disabled:opacity-50">
                            Atribuir a Novas Divulgadoras
                        </button>
                        <button onClick={handleSendReminder} disabled={isSendingReminder || pendingProofCount === 0} className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {isSendingReminder ? 'Enviando...' : `Enviar Lembrete de Comprovação (${pendingProofCount})`}
                        </button>
                    </div>
                </div>

                {/* Assignments List */}
                <div className="lg:col-span-2 bg-dark/70 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                         <h2 className="text-xl font-bold text-white">Divulgadoras Designadas</h2>
                         <div className="text-right">
                            <p className="text-lg font-semibold">{confirmationStats.confirmed} / {confirmationStats.total} <span className="text-sm font-normal">Confirmaram</span></p>
                            <p className="text-sm font-semibold">{confirmationStats.proofs} / {confirmationStats.total} <span className="text-xs font-normal">Comprovaram</span></p>
                         </div>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                             <thead className="bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Nome</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Data Confirmação</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Comprovação</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-700">
                                {assignments.map(a => (
                                    <tr key={a.id}>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                                            <button
                                                onClick={() => handleOpenStatsModal(a)}
                                                className="text-gray-200 hover:text-primary hover:underline font-medium"
                                            >
                                                {a.promoterName}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                                            {a.status === 'confirmed' ? (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>
                                            ) : (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400">{formatDate(a.confirmedAt)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            {a.proofImageUrls && a.proofImageUrls.length > 0 ? (
                                                <div className="flex gap-1">
                                                    {a.proofImageUrls.map((url, index) => (
                                                        <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                                            <img src={url} alt={`Prova ${index + 1}`} className="w-10 h-10 object-cover rounded-md" />
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-500">N/A</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                             </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div>
             <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <div>
                     <button onClick={() => navigate('/admin/posts')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Todas as Publicações</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Detalhes da Publicação</h1>
                </div>
                <button
                    onClick={handleDelete}
                    disabled={isDeleting || isSaving}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                    {isDeleting ? 'Deletando...' : 'Deletar Publicação'}
                </button>
            </div>
             {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
             {successMessage && <div className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4 text-sm font-semibold">{successMessage}</div>}
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
            </div>
            <PromoterPostStatsModal
                isOpen={statsModalOpen}
                onClose={() => setStatsModalOpen(false)}
                promoter={selectedPromoter}
            />
            <AssignPostModal
                isOpen={isAssignModalOpen}
                onClose={() => setIsAssignModalOpen(false)}
                post={post}
                existingAssignments={assignments}
                onSuccess={fetchDetails}
            />
            <EditPostModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                post={post}
                onSave={handleSaveContent}
            />
        </div>
    );
};

export default PostDetails;