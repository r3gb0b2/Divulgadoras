import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getPostWithAssignments,
    updatePost,
    deletePost,
    sendPostReminder,
    sendSinglePostReminder,
    renewAssignmentDeadline,
    removePromoterFromPostAndGroup,
} from '../services/postService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import PromoterPostStatsModal from '../components/PromoterPostStatsModal';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const timestampToInputDate = (ts: any): string => {
    if (!ts) return '';
    let date;
    if (ts.toDate) { date = ts.toDate(); }
    else if (typeof ts === 'object' && (ts.seconds || ts._seconds)) {
        const seconds = ts.seconds || ts._seconds;
        date = new Date(seconds * 1000);
    } else { date = new Date(ts); }
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

export const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed'>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Modals state
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [selectedPromoter, setSelectedPromoter] = useState<PostAssignment | null>(null);

    const fetchData = useCallback(async () => {
        if (!postId) {
            setError("ID da publicação não encontrado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { post: postData, assignments: assignmentsData } = await getPostWithAssignments(postId);
            setPost(postData);
            setAssignments(assignmentsData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleUpdatePostDetails = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        setActionLoading('save');
        setError(null);
        try {
            let finalUpdateData = { ...updatedData };
            if (newMediaFile) {
                const fileExtension = newMediaFile.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = ref(storage, `posts-media/${fileName}`);
                await uploadBytes(storageRef, newMediaFile);
                finalUpdateData.mediaUrl = await getDownloadURL(storageRef);
            }
            await updatePost(post.id, finalUpdateData);
            await fetchData();
        } catch (err: any) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };
    
    const handleDeletePost = async () => {
        if (!post) return;
        if (window.confirm("Tem certeza que deseja excluir esta publicação? Todas as atribuições também serão removidas. Esta ação não pode ser desfeita.")) {
            setActionLoading('delete');
            try {
                await deletePost(post.id);
                navigate('/admin/posts');
            } catch (err: any) {
                setError((err as Error).message);
                setActionLoading(null);
            }
        }
    };
    
    const handleUpdatePostStatus = async (updateData: Partial<Post>) => {
        if (!post) return;
        setActionLoading(JSON.stringify(updateData));
        setError(null);
        try {
            await updatePost(post.id, updateData);
            await fetchData();
        } catch(err: any) {
             setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSendReminders = async () => {
        if (!post) return;
        setActionLoading('remind');
        try {
            const result = await sendPostReminder(post.id);
            alert(result.message);
        } catch (err: any) {
            setError((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    }
    
    const filteredAssignments = useMemo(() => {
        return assignments
            .filter(a => {
                if (filter === 'all') return true;
                if (filter === 'pending') return a.status === 'pending' && !a.proofSubmittedAt;
                if (filter === 'confirmed') return a.status === 'confirmed' && !a.proofSubmittedAt;
                if (filter === 'completed') return !!a.proofSubmittedAt;
                return false;
            })
            .sort((a, b) => a.promoterName.localeCompare(b.promoterName));
    }, [assignments, filter]);

    const stats = useMemo(() => ({
        total: assignments.length,
        pending: assignments.filter(a => a.status === 'pending' && !a.proofSubmittedAt).length,
        confirmed: assignments.filter(a => a.status === 'confirmed' && !a.proofSubmittedAt).length,
        completed: assignments.filter(a => !!a.proofSubmittedAt).length,
    }), [assignments]);

    const openStatsModal = (promoter: PostAssignment) => {
        setSelectedPromoter(promoter);
        setIsStatsModalOpen(true);
    };

    if (isLoading) return <div className="text-center py-10">Carregando...</div>;
    if (error && !post) return <p className="text-red-400 text-center py-10">{error}</p>;
    if (!post) return <p className="text-center py-10">Publicação não encontrada.</p>;
    
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
            </div>

            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md mb-4">{error}</p>}

            {/* Post Info Section */}
            <div className="bg-secondary shadow-lg rounded-lg p-6 mb-6">
                <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                    <div>
                        <p className="text-xl font-bold text-primary">{post.campaignName}</p>
                        <p className="text-sm text-gray-400">Criado por: {post.createdByEmail}</p>
                        <p className="text-sm text-gray-400">Data Limite: {post.expiresAt ? new Date((post.expiresAt as Timestamp).seconds * 1000).toLocaleDateString('pt-BR') : 'N/A'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <button onClick={() => setIsEditModalOpen(true)} className="px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">Editar Conteúdo</button>
                        <button onClick={handleDeletePost} disabled={actionLoading === 'delete'} className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm disabled:opacity-50">{actionLoading === 'delete' ? '...' : 'Excluir'}</button>
                    </div>
                </div>
                {/* Post Content */}
                <div className="mt-4 border-t border-gray-700 pt-4">
                     {post.type === 'image' && post.mediaUrl && <img src={post.mediaUrl} alt="Post media" className="max-w-xs rounded-md mb-4" />}
                     {post.type === 'video' && post.mediaUrl && <video src={post.mediaUrl} controls className="max-w-xs rounded-md mb-4" />}
                     {post.type === 'text' && <pre className="text-gray-300 whitespace-pre-wrap font-sans text-base bg-dark/70 p-3 rounded-md">{post.textContent}</pre>}
                     <h4 className="font-semibold mt-4">Instruções:</h4>
                     <p className="text-gray-400 text-sm whitespace-pre-wrap">{post.instructions}</p>
                     {post.postLink && <div className='mt-2'>
                        <h4 className='font-semibold'>Link da publicação:</h4>
                        <a href={post.postLink} target='_blank' rel='noopener noreferrer' className="text-primary hover:underline text-sm">{post.postLink}</a>
                     </div>}
                </div>
                {/* Post Settings */}
                <div className="mt-4 border-t border-gray-700 pt-4 space-y-3">
                    <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={post.isActive} onChange={e => handleUpdatePostStatus({isActive: e.target.checked})} className="h-4 w-4" /><span>Ativo (visível)</span></label>
                    <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={post.autoAssignToNewPromoters} onChange={e => handleUpdatePostStatus({autoAssignToNewPromoters: e.target.checked})} className="h-4 w-4" /><span>Atribuir para novas divulgadoras</span></label>
                     <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={post.allowLateSubmissions} onChange={e => handleUpdatePostStatus({allowLateSubmissions: e.target.checked})} className="h-4 w-4" /><span>Permitir envio de comprovação fora do prazo</span></label>
                     <div>
                        <label className="text-sm">Data Limite (opcional)</label>
                        <input type="date" value={timestampToInputDate(post.expiresAt)} onChange={e => handleUpdatePostStatus({expiresAt: e.target.value ? Timestamp.fromDate(new Date(e.target.value  + 'T23:59:59')) : null})} className="ml-2 px-2 py-1 bg-gray-700 rounded-md" style={{ colorScheme: 'dark' }}/>
                     </div>
                </div>
            </div>

            {/* Assignments Section */}
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                    <h2 className="text-xl font-semibold">Divulgadoras Designadas ({assignments.length})</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setIsAssignModalOpen(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Atribuir a Mais</button>
                        <button onClick={handleSendReminders} disabled={actionLoading === 'remind'} className="px-3 py-1.5 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm disabled:opacity-50">{actionLoading === 'remind' ? '...' : 'Enviar Lembrete'}</button>
                    </div>
                </div>
                 <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg mb-4">
                    {(['all', 'pending', 'confirmed', 'completed'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-sm font-medium rounded-md ${filter === f ? 'bg-primary' : ''}`}>
                            {{'all': `Todas (${stats.total})`, 'pending': `Pendentes (${stats.pending})`, 'confirmed': `Confirmadas (${stats.confirmed})`, 'completed': `Concluídas (${stats.completed})`}[f]}
                        </button>
                    ))}
                </div>
                {/* List of assignments */}
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {filteredAssignments.map(a => <AssignmentItem key={a.id} assignment={a} onAction={fetchData} openPhotoViewer={(urls) => { setPhotoViewerUrls(urls); setIsPhotoViewerOpen(true); }} openStatsModal={() => openStatsModal(a)} />)}
                </div>
            </div>

            {/* Modals */}
            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={0} />
            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleUpdatePostDetails} />
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <PromoterPostStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedPromoter} />
        </div>
    );
};

const AssignmentItem: React.FC<{
    assignment: PostAssignment, 
    onAction: () => void,
    openPhotoViewer: (urls: string[]) => void,
    openStatsModal: () => void
}> = ({ assignment, onAction, openPhotoViewer, openStatsModal }) => {
    
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const handleSingleReminder = async () => {
        setActionLoading('remind');
        try {
            const res = await sendSinglePostReminder(assignment.id);
            alert(res.message);
        } catch(e) { alert((e as Error).message); }
        finally { setActionLoading(null); }
    };
    
    const handleRenewDeadline = async () => {
        setActionLoading('renew');
        try {
            await renewAssignmentDeadline(assignment.id);
            onAction();
        } catch(e) { alert((e as Error).message); }
        finally { setActionLoading(null); }
    };

    const handleRemove = async () => {
        if (window.confirm(`Remover ${assignment.promoterName} desta publicação e marcar como 'fora do grupo'?`)) {
             setActionLoading('remove');
             try {
                await removePromoterFromPostAndGroup(assignment.id, assignment.promoterId);
                onAction();
             } catch(e) { alert((e as Error).message); }
             finally { setActionLoading(null); }
        }
    };
    
    const statusText = assignment.proofSubmittedAt ? `Enviado em: ${new Date((assignment.proofSubmittedAt as Timestamp).seconds * 1000).toLocaleString('pt-BR')}`
                     : assignment.status === 'confirmed' ? `Confirmado em: ${new Date((assignment.confirmedAt as Timestamp).seconds * 1000).toLocaleString('pt-BR')}`
                     : 'Pendente';
    
    return (
        <div className="bg-dark/70 p-3 rounded-md">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-white">{assignment.promoterName}</p>
                    <p className="text-xs text-gray-400">{statusText}</p>
                </div>
                <div className="flex gap-2 items-center">
                    {assignment.proofImageUrls && assignment.proofImageUrls.length > 0 && 
                        <button onClick={() => openPhotoViewer(assignment.proofImageUrls!)} className="text-sm text-green-400">Ver Print</button>
                    }
                    {assignment.status === 'confirmed' && !assignment.proofSubmittedAt && (
                        <button onClick={handleSingleReminder} disabled={!!actionLoading} className="text-sm text-yellow-400 disabled:opacity-50">Lembrar</button>
                    )}
                </div>
            </div>
            <div className="flex justify-end gap-3 text-xs font-medium mt-2 pt-2 border-t border-gray-600/50">
                <button onClick={openStatsModal} className="text-gray-400 hover:text-white">Ver Stats</button>
                <button onClick={handleRenewDeadline} disabled={!!actionLoading} className="text-blue-400 hover:text-blue-300 disabled:opacity-50">Renovar Prazo</button>
                <button onClick={handleRemove} disabled={!!actionLoading} className="text-red-400 hover:text-red-300 disabled:opacity-50">Remover</button>
            </div>
        </div>
    );
}
