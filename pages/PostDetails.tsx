
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment, Promoter } from '../types';
import { getPostWithAssignments, updatePost, deletePost, acceptAllJustifications, updateAssignment } from '../services/postService';
import { getPromotersByIds } from '../services/promoterService';
import { ArrowLeftIcon, PencilIcon, TrashIcon, UserPlusIcon, SearchIcon, InstagramIcon, WhatsAppIcon, ChartBarIcon, CheckCircleIcon, AlertTriangleIcon } from '../components/Icons';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import StorageMedia from '../components/StorageMedia';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import JustificationReviewModal from '../components/JustificationReviewModal';
import { storage } from '../firebase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [promotersMap, setPromotersMap] = useState<Map<string, Promoter>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modais
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [selectedPromoterForStats, setSelectedPromoterForStats] = useState<Promoter | null>(null);

    // Filtros
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'justified'>('all');
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);

    const fetchData = useCallback(async () => {
        if (!postId) return;
        setIsLoading(true);
        try {
            const { post: postData, assignments: assignmentsData } = await getPostWithAssignments(postId);
            setPost(postData);
            setAssignments(assignmentsData);

            const promoterIds = [...new Set(assignmentsData.map(a => a.promoterId))];
            if (promoterIds.length > 0) {
                const promoters = await getPromotersByIds(promoterIds);
                setPromotersMap(new Map(promoters.map(p => [p.id, p])));
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar detalhes.');
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const pendingJustifications = useMemo(() => {
        return assignments.filter(a => a.justification && (!a.justificationStatus || a.justificationStatus === 'pending'));
    }, [assignments]);

    const handleSavePost = async (updatedData: Partial<Post>, newMediaFile: File | null) => {
        if (!post) return;
        let mediaUrl = updatedData.mediaUrl;
        if (newMediaFile) {
            const ext = newMediaFile.name.split('.').pop();
            const path = `posts-media/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
            const ref = storage.ref(path);
            await ref.put(newMediaFile);
            mediaUrl = path;
        }
        await updatePost(post.id, { ...updatedData, mediaUrl });
        await fetchData();
    };

    const handleDeletePost = async () => {
        if (!post) return;
        if (window.confirm("Tem certeza que deseja EXCLUIR este post e todas as tarefas vinculadas? Esta ação é irreversível.")) {
            await deletePost(post.id);
            navigate('/admin/posts');
        }
    };

    const handleAcceptAllJustifications = async () => {
        if (!post) return;
        if (!window.confirm(`Deseja aceitar TODAS as ${pendingJustifications.length} justificativas pendentes para este post?`)) return;

        setIsProcessingBulk(true);
        try {
            await acceptAllJustifications(post.id);
            alert("Todas as justificativas foram aceitas!");
            setIsJustificationModalOpen(false);
            await fetchData();
        } catch (err: any) {
            alert("Erro: " + err.message);
        } finally {
            setIsProcessingBulk(false);
        }
    };

    const filteredAssignments = useMemo(() => {
        return assignments.filter(a => {
            const promoter = promotersMap.get(a.promoterId);
            const nameMatch = (promoter?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (promoter?.instagram || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            if (!nameMatch) return false;
            
            if (statusFilter === 'all') return true;
            if (statusFilter === 'pending') return a.status === 'pending' && !a.proofSubmittedAt && !a.justification;
            if (statusFilter === 'confirmed') return a.status === 'confirmed' && !a.proofSubmittedAt;
            if (statusFilter === 'completed') return !!a.proofSubmittedAt || a.justificationStatus === 'accepted';
            if (statusFilter === 'justified') return !!a.justification && (a.justificationStatus === 'pending' || !a.justificationStatus);
            return true;
        });
    }, [assignments, promotersMap, searchQuery, statusFilter]);

    if (isLoading) return <div className="flex justify-center items-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    if (error || !post) return <div className="p-10 text-center text-red-400 bg-red-900/20 rounded-xl m-4">{error || "Post não encontrado."}</div>;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditModalOpen(true)} className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600" title="Editar Post"><PencilIcon className="w-5 h-5"/></button>
                    <button onClick={handleDeletePost} className="p-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 border border-red-900" title="Excluir Post"><TrashIcon className="w-5 h-5"/></button>
                </div>
            </div>

            {/* Resumo do Post */}
            <div className="bg-secondary p-6 rounded-3xl border border-white/5 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 rounded-2xl overflow-hidden border border-gray-700 h-48 md:h-full">
                    <StorageMedia path={post.mediaUrl || ''} type={post.type === 'text' ? 'image' : post.type} className="w-full h-full object-cover bg-black" />
                </div>
                <div className="md:col-span-2 space-y-4">
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-tight">{post.campaignName}</h1>
                        <p className="text-primary font-bold text-sm">{post.eventName || 'Tarefa de Equipe'}</p>
                    </div>
                    <div className="bg-dark/50 p-4 rounded-2xl text-sm text-gray-300 italic whitespace-pre-wrap max-h-32 overflow-y-auto font-medium">
                        {post.instructions}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${post.isActive ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-red-900/30 text-red-400 border-red-800'}`}>
                            {post.isActive ? 'Post Ativo' : 'Inativo'}
                        </span>
                        {post.expiresAt && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase border bg-blue-900/30 text-blue-400 border-blue-800">
                                Expira: {new Date(post.expiresAt.seconds * 1000).toLocaleDateString('pt-BR')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Gestão de Divulgadoras */}
            <div className="bg-secondary rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <UserPlusIcon className="w-6 h-6 text-primary" />
                        Tarefas Individuais ({assignments.length})
                    </h2>
                    <div className="flex gap-3 w-full md:w-auto">
                        {pendingJustifications.length > 0 && (
                            <button 
                                onClick={() => setIsJustificationModalOpen(true)}
                                className="flex-1 md:flex-none px-4 py-2 bg-orange-600 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-orange-500 transition-all shadow-lg shadow-orange-900/20 flex items-center justify-center gap-2"
                            >
                                <AlertTriangleIcon className="w-4 h-4" />
                                Justificativas ({pendingJustifications.length})
                            </button>
                        )}
                        <button onClick={() => setIsAssignModalOpen(true)} className="flex-1 md:flex-none px-4 py-2 bg-primary text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-primary-dark transition-all shadow-lg shadow-primary/20">
                            + Atribuir Divulgadoras
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-dark/30 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="Buscar por nome ou @instagram..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-dark border border-gray-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                    <div className="flex space-x-1 p-1 bg-dark rounded-xl border border-gray-700 overflow-x-auto">
                        {(['all', 'pending', 'confirmed', 'justified', 'completed'] as const).map(f => (
                            <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all whitespace-nowrap ${statusFilter === f ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                                {{'all':'Todos','pending':'Novos','confirmed':'Aguardando','completed':'Concluídos','justified':'Justificativas'}[f]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                <th className="px-6 py-4">Divulgadora</th>
                                <th className="px-6 py-4">Status da Tarefa</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredAssignments.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-10 text-center text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhum resultado para este filtro</td>
                                </tr>
                            ) : (
                                filteredAssignments.map(a => {
                                    const p = promotersMap.get(a.promoterId);
                                    return (
                                        <tr key={a.id} className="hover:bg-white/[0.02] group transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <img src={p?.facePhotoUrl || p?.photoUrls[0] || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-xl object-cover border border-gray-700 shadow-sm" alt=""/>
                                                    <div>
                                                        <p className="text-white font-bold text-sm leading-none">{p?.name || a.promoterName}</p>
                                                        <div className="flex gap-2 mt-1.5">
                                                            <a href={`https://instagram.com/${p?.instagram}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-400 transition-colors"><InstagramIcon className="w-3.5 h-3.5"/></a>
                                                            <a href={`https://wa.me/55${p?.whatsapp}`} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-400 transition-colors"><WhatsAppIcon className="w-3.5 h-3.5"/></a>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {a.proofSubmittedAt || a.justificationStatus === 'accepted' ? (
                                                    <span className="px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800 text-[9px] font-black uppercase tracking-widest">Concluído</span>
                                                ) : a.status === 'confirmed' ? (
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800 text-[9px] font-black uppercase tracking-widest">Aguardando Print</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800 text-[9px] font-black uppercase tracking-widest">Não Iniciado</span>
                                                )}
                                                {a.justification && (!a.justificationStatus || a.justificationStatus === 'pending') && (
                                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-400 border border-orange-800 text-[9px] font-black uppercase tracking-widest animate-pulse">Justificativa!</span>
                                                )}
                                                {a.justificationStatus === 'rejected' && (
                                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-800 text-[9px] font-black uppercase tracking-widest">Recusada</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                                    <button onClick={() => { setSelectedPromoterForStats(p || null); setIsStatsModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors" title="Ver Histórico"><ChartBarIcon className="w-4 h-4"/></button>
                                                    <button onClick={() => { setSelectedAssignment(a); setIsStatusModalOpen(true); }} className="px-3 py-1.5 bg-primary text-white font-black text-[9px] uppercase tracking-widest rounded-lg hover:bg-primary-dark transition-all shadow-md shadow-primary/20">Analisar</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <ChangeAssignmentStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} assignment={selectedAssignment} onSave={async (id, data) => { await updateAssignment(id, data); fetchData(); }} />
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedPromoterForStats} />
            <JustificationReviewModal 
                isOpen={isJustificationModalOpen} 
                onClose={() => setIsJustificationModalOpen(false)} 
                post={post} 
                assignments={pendingJustifications} 
                onAcceptAll={handleAcceptAllJustifications} 
                isProcessing={isProcessingBulk} 
            />
        </div>
    );
};

export default PostDetails;
