
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, PostAssignment, Promoter, Timestamp } from '../types';
import { getPostWithAssignments, getAssignmentsForOrganization, updatePost, deletePost, acceptAllJustifications, updateAssignment } from '../services/postService';
import { getPromotersByIds } from '../services/promoterService';
import { ArrowLeftIcon, MegaphoneIcon, PencilIcon, TrashIcon, UserPlusIcon, CheckCircleIcon, SearchIcon, InstagramIcon, WhatsAppIcon, ChartBarIcon } from '../components/Icons';
import EditPostModal from '../components/EditPostModal';
import AssignPostModal from '../components/AssignPostModal';
import ChangeAssignmentStatusModal from '../components/ChangeAssignmentStatusModal';
import StorageMedia from '../components/StorageMedia';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
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
    const [selectedAssignment, setSelectedAssignment] = useState<PostAssignment | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [selectedPromoterForStats, setSelectedPromoterForStats] = useState<Promoter | null>(null);

    // Filtros
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed'>('all');

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

    const filteredAssignments = useMemo(() => {
        return assignments.filter(a => {
            const promoter = promotersMap.get(a.promoterId);
            const nameMatch = (promoter?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (promoter?.instagram || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            if (statusFilter === 'all') return nameMatch;
            if (statusFilter === 'pending') return nameMatch && a.status === 'pending' && !a.proofSubmittedAt;
            if (statusFilter === 'confirmed') return nameMatch && a.status === 'confirmed' && !a.proofSubmittedAt;
            if (statusFilter === 'completed') return nameMatch && !!a.proofSubmittedAt;
            return nameMatch;
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
                    <button onClick={() => setIsEditModalOpen(true)} className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"><PencilIcon className="w-5 h-5"/></button>
                    <button onClick={handleDeletePost} className="p-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 border border-red-900"><TrashIcon className="w-5 h-5"/></button>
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
                    <div className="bg-dark/50 p-4 rounded-2xl text-sm text-gray-300 italic whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {post.instructions}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${post.isActive ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-red-900/30 text-red-400 border-red-800'}`}>
                            {post.isActive ? 'Post Ativo' : 'Inativo'}
                        </span>
                        {post.expiresAt && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-blue-900/30 text-blue-400 border-blue-800">
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
                    <button onClick={() => setIsAssignModalOpen(true)} className="px-4 py-2 bg-primary text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-primary-dark transition-all shadow-lg shadow-primary/20">
                        + Atribuir Divulgadoras
                    </button>
                </div>

                <div className="p-4 bg-dark/30 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="Buscar divulgadora..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-dark border border-gray-700 rounded-xl text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                    <div className="flex space-x-1 p-1 bg-dark rounded-lg border border-gray-700">
                        {(['all', 'pending', 'confirmed', 'completed'] as const).map(f => (
                            <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${statusFilter === f ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                                {{'all':'Todos','pending':'Novos','confirmed':'Aguardando','completed':'Concluídos'}[f]}
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
                            {filteredAssignments.map(a => {
                                const p = promotersMap.get(a.promoterId);
                                return (
                                    <tr key={a.id} className="hover:bg-white/[0.02] group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img src={p?.facePhotoUrl || p?.photoUrls[0] || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-xl object-cover border border-gray-700" alt=""/>
                                                <div>
                                                    <p className="text-white font-bold text-sm leading-none">{p?.name || a.promoterName}</p>
                                                    <div className="flex gap-2 mt-1.5">
                                                        <a href={`https://instagram.com/${p?.instagram}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-400"><InstagramIcon className="w-3.5 h-3.5"/></a>
                                                        <a href={`https://wa.me/55${p?.whatsapp}`} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-400"><WhatsAppIcon className="w-3.5 h-3.5"/></a>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {a.proofSubmittedAt ? (
                                                <span className="px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800 text-[9px] font-black uppercase">Concluído</span>
                                            ) : a.status === 'confirmed' ? (
                                                <span className="px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800 text-[9px] font-black uppercase">Aguardando Print</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800 text-[9px] font-black uppercase">Não Iniciado</span>
                                            )}
                                            {a.justification && !a.justificationStatus && (
                                                <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-900/30 text-orange-400 border border-orange-800 text-[9px] font-black uppercase">Justificativa!</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={() => { setSelectedPromoterForStats(p || null); setIsStatsModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600" title="Ver Histórico"><ChartBarIcon className="w-4 h-4"/></button>
                                                <button onClick={() => { setSelectedAssignment(a); setIsStatusModalOpen(true); }} className="px-3 py-1.5 bg-primary text-white font-black text-[9px] uppercase tracking-widest rounded-lg hover:bg-primary-dark">Analisar</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modais */}
            <EditPostModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} post={post} onSave={handleSavePost} />
            <AssignPostModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} post={post} existingAssignments={assignments} onSuccess={fetchData} />
            <ChangeAssignmentStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} assignment={selectedAssignment} onSave={async (id, data) => { await updateAssignment(id, data); fetchData(); }} />
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={selectedPromoterForStats} />
        </div>
    );
};

export default PostDetails;
