
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg, getAssignmentsForOrganization, updatePost, acceptAllJustifications } from '../services/postService';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { Post, Organization, PostAssignment, AdminUserData, Campaign } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon, ClockIcon, CheckCircleIcon, LockClosedIcon, UserPlusIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import StorageMedia from '../components/StorageMedia';
import JustificationReviewModal from '../components/JustificationReviewModal';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const getRelativeTime = (ts: any): string => {
    const date = toDateSafe(ts);
    if (!date) return '';
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'hoje';
    if (diffInDays === 1) return 'ontem';
    return `há ${diffInDays} dias`;
};

const AdminPosts: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
    const [filterCampaign, setFilterCampaign] = useState<string>('all');
    const [notifyingPostId, setNotifyingPostId] = useState<string | null>(null);

    // Controle de Justificativas
    const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
    const [selectedPostForJustifications, setSelectedPostForJustifications] = useState<Post | null>(null);
    const [isAcceptingAll, setIsAcceptingAll] = useState(false);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchPosts = useCallback(async (showLoader = true) => {
        if (!adminData) return;
        if (showLoader) setIsLoading(true);
        setError(null);
        const orgId = isSuperAdmin ? undefined : selectedOrgId;
        if (!isSuperAdmin && !orgId) {
            setError("Organização não encontrada.");
            setIsLoading(false); return;
        }

        try {
            const [fetchedPosts, fetchedAssignments, fetchedOrgs, fetchedCampaigns] = await Promise.all([
                getPostsForOrg(orgId, adminData),
                orgId ? getAssignmentsForOrganization(orgId) : Promise.resolve([]),
                isSuperAdmin ? getOrganizations() : Promise.resolve([]),
                orgId ? getAllCampaigns(orgId) : Promise.resolve([])
            ]);
            setPosts(fetchedPosts);
            setAssignments(fetchedAssignments);
            setOrganizations(fetchedOrgs);
            setCampaigns(fetchedCampaigns);
        } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
    }, [adminData, isSuperAdmin, selectedOrgId]);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    const pendingJustificationsMap = useMemo(() => {
        const map = new Map<string, PostAssignment[]>();
        assignments.forEach(a => { 
            if (a.justification && (!a.justificationStatus || a.justificationStatus === 'pending')) {
                const current = map.get(a.postId) || [];
                map.set(a.postId, [...current, a]);
            }
        });
        return map;
    }, [assignments]);

    const postStatsMap = useMemo(() => {
        const map = new Map<string, { total: number, completed: number }>();
        assignments.forEach(a => {
            const current = map.get(a.postId) || { total: 0, completed: 0 };
            current.total++;
            if (a.proofSubmittedAt || a.justificationStatus === 'accepted') current.completed++;
            map.set(a.postId, current);
        });
        return map;
    }, [assignments]);

    const filteredPosts = useMemo(() => {
        const now = new Date();
        return posts.filter(p => {
            const isExpired = p.expiresAt && toDateSafe(p.expiresAt) < now;
            const matchesStatus = statusFilter === 'all' 
                || (statusFilter === 'active' && p.isActive && !isExpired)
                || (statusFilter === 'inactive' && (!p.isActive || isExpired));
            const matchesCampaign = filterCampaign === 'all' || p.campaignName === filterCampaign;
            return matchesStatus && matchesCampaign;
        });
    }, [posts, statusFilter, filterCampaign]);

    const handleQuickUpdate = async (postId: string, data: Partial<Post>) => {
        try {
            // Update local state for immediate feedback
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...data } : p));
            await updatePost(postId, data);
        } catch (e: any) {
            alert("Erro ao atualizar: " + e.message);
            fetchPosts(false);
        }
    };

    const handleNotifyPush = async (postId: string) => {
        if (!window.confirm("Deseja enviar um aviso Push para todas as divulgadoras deste post?")) return;
        setNotifyingPostId(postId);
        try {
            const notifyPostPush = httpsCallable(functions, 'notifyPostPush');
            const result = await notifyPostPush({ postId });
            const data = result.data as { success: boolean, message: string };
            alert(data.message);
        } catch (e: any) {
            alert("Erro ao notificar: " + e.message);
        } finally {
            setNotifyingPostId(null);
        }
    };

    const handleOpenJustifications = (post: Post) => {
        setSelectedPostForJustifications(post);
        setIsJustificationModalOpen(true);
    };

    const handleAcceptAll = async () => {
        if (!selectedPostForJustifications) return;
        setIsAcceptingAll(true);
        try {
            await acceptAllJustifications(selectedPostForJustifications.id);
            alert("Todas as justificativas foram aceitas!");
            setIsJustificationModalOpen(false);
            fetchPosts(false);
        } catch (err: any) {
            alert("Erro: " + err.message);
        } finally {
            setIsAcceptingAll(false);
        }
    };

    return (
        <div className="pb-20">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Posts e Tarefas</h1>
                <div className="flex gap-2">
                    <button onClick={() => navigate('/admin/posts/new')} className="px-4 py-2 bg-primary text-white font-black rounded-xl hover:bg-primary-dark text-xs uppercase tracking-widest shadow-lg shadow-primary/20">+ Novo Post</button>
                    <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 text-gray-400 rounded-xl hover:text-white transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl">
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="flex space-x-1 p-1 bg-dark/50 rounded-xl w-fit border border-white/5">
                        {(['active', 'inactive', 'all'] as const).map(f => (
                            <button key={f} onClick={() => setStatusFilter(f)} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${statusFilter === f ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                                {{'active':'Ativos','inactive':'Inativos','all':'Todos'}[f]}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando tarefas...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPosts.map(post => {
                            const stats = postStatsMap.get(post.id) || { total: 0, completed: 0 };
                            const pendingJustifications = pendingJustificationsMap.get(post.id) || [];
                            const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                            
                            return (
                                <div key={post.id} className="bg-dark/40 rounded-[2rem] shadow-xl flex flex-col overflow-hidden border border-white/5 group hover:border-white/10 transition-all">
                                    <div className="h-44 relative overflow-hidden">
                                        <StorageMedia path={post.mediaUrl || ''} type={post.type === 'text' ? 'image' : post.type} className="w-full h-full object-cover bg-gray-900 group-hover:scale-105 transition-transform duration-700" />
                                        <div className="absolute top-4 left-4 flex gap-2">
                                             <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${post.isActive ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>
                                                {post.isActive ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 flex flex-col flex-grow">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="min-w-0">
                                                <h3 className="font-black text-lg text-white uppercase tracking-tight truncate leading-tight">{post.campaignName}</h3>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 flex items-center gap-1.5">
                                                    <ClockIcon className="w-3 h-3" />
                                                    {post.createdByEmail.split('@')[0]} em {toDateSafe(post.createdAt)?.toLocaleDateString('pt-BR')} ({getRelativeTime(post.createdAt)})
                                                </p>
                                            </div>
                                            <button 
                                                onClick={() => handleNotifyPush(post.id)} 
                                                disabled={notifyingPostId === post.id || !post.isActive}
                                                className="p-2 bg-indigo-900/20 text-indigo-400 rounded-xl hover:bg-indigo-900/40 disabled:opacity-30 transition-all"
                                                title="Notificar toda a equipe via PUSH"
                                            >
                                                {notifyingPostId === post.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <FaceIdIcon className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        {/* QUICK CHECKS */}
                                        <div className="grid grid-cols-1 gap-2 my-4 py-4 border-y border-white/5">
                                            <label className="flex items-center gap-3 cursor-pointer group/item">
                                                <input 
                                                    type="checkbox" 
                                                    checked={post.isActive} 
                                                    onChange={e => handleQuickUpdate(post.id, { isActive: e.target.checked })}
                                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary" 
                                                />
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">Postagem Ativa</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group/item">
                                                <input 
                                                    type="checkbox" 
                                                    checked={post.autoAssignToNewPromoters} 
                                                    onChange={e => handleQuickUpdate(post.id, { autoAssignToNewPromoters: e.target.checked })}
                                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary" 
                                                />
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">Auto-atribuir (Novas)</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group/item">
                                                <input 
                                                    type="checkbox" 
                                                    checked={post.ownerOnly} 
                                                    onChange={e => handleQuickUpdate(post.id, { ownerOnly: e.target.checked })}
                                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary" 
                                                />
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">Privado (SÓ MEU)</span>
                                            </label>
                                        </div>

                                        {/* JUSTIFICATIONS BUTTON */}
                                        <button 
                                            onClick={() => handleOpenJustifications(post)}
                                            className={`w-full py-2.5 rounded-xl mb-4 border transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${pendingJustifications.length > 0 ? 'bg-orange-900/30 text-orange-400 border-orange-500/50 animate-pulse' : 'bg-gray-800/30 text-gray-500 border-gray-700/50 hover:text-white'}`}
                                        >
                                            <AlertTriangleIcon className="w-4 h-4" />
                                            {pendingJustifications.length > 0 ? `${pendingJustifications.length} Justificativas Pendentes` : 'Sem Justificativas'}
                                        </button>
                                        
                                        <div className="mt-auto">
                                            <div className="flex justify-between items-end text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">
                                                <span>Efetivação</span>
                                                <span className="text-white font-mono">{stats.completed}/{stats.total} • {percentage}%</span>
                                            </div>
                                            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full transition-all duration-1000 ${percentage >= 80 ? 'bg-green-500' : percentage >= 40 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${percentage}%` }}></div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => navigate(`/admin/posts/${post.id}`)} 
                                            className="w-full mt-6 py-4 bg-gray-800 text-white font-black rounded-2xl hover:bg-gray-700 transition-all text-[10px] uppercase tracking-[0.2em] border border-white/5"
                                        >
                                            Detalhes da Equipe
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <JustificationReviewModal 
                isOpen={isJustificationModalOpen} 
                onClose={() => setIsJustificationModalOpen(false)} 
                post={selectedPostForJustifications} 
                assignments={pendingJustificationsMap.get(selectedPostForJustifications?.id || '') || []} 
                onAcceptAll={handleAcceptAll} 
                isProcessing={isAcceptingAll} 
            />
        </div>
    );
};

export default AdminPosts;
