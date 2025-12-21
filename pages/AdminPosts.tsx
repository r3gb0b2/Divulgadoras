
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg, getAssignmentsForOrganization, updatePost, acceptAllJustifications } from '../services/postService';
import { getOrganization, getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { Post, Organization, PostAssignment, AdminUserData, Campaign } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon, FaceIdIcon, RefreshIcon } from '../components/Icons';
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

    const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
    const [selectedPostForJustifications, setSelectedPostForJustifications] = useState<Post | null>(null);
    const [isAcceptingAll, setIsAcceptingAll] = useState(false);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchPosts = useCallback(async () => {
        if (!adminData) return;
        if (posts.length === 0) setIsLoading(true);
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
    }, [adminData, isSuperAdmin, selectedOrgId, posts.length]);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    const pendingJustificationsMap = useMemo(() => {
        const map = new Map<string, number>();
        assignments.forEach(a => { if (a.justificationStatus === 'pending') map.set(a.postId, (map.get(a.postId) || 0) + 1); });
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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Posts e Tarefas</h1>
                <div className="flex gap-2">
                    <button onClick={() => navigate('/admin/posts/new')} className="px-4 py-2 bg-primary text-white font-semibold rounded-md">+ Novo Post</button>
                    <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-md text-sm">Voltar</button>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg w-fit">
                        {(['active', 'inactive', 'all'] as const).map(f => (
                            <button key={f} onClick={() => setStatusFilter(f)} className={`px-4 py-1.5 text-sm font-medium rounded-md ${statusFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{ {'active':'Ativos','inactive':'Inativos','all':'Todos'}[f] }</button>
                        ))}
                    </div>
                </div>

                {isLoading ? <p className="text-center py-8">Carregando...</p> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPosts.map(post => {
                            const stats = postStatsMap.get(post.id) || { total: 0, completed: 0 };
                            const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                            return (
                                <div key={post.id} className="bg-dark/70 rounded-lg shadow-sm flex flex-col overflow-hidden border border-gray-700/50">
                                    <StorageMedia path={post.mediaUrl || ''} type={post.type === 'text' ? 'image' : post.type} className="h-40 w-full object-cover bg-gray-800" />
                                    <div className="p-4 flex flex-col flex-grow">
                                        <div className="flex justify-between">
                                            <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                            <button 
                                                onClick={() => handleNotifyPush(post.id)} 
                                                disabled={notifyingPostId === post.id}
                                                className="text-indigo-400 hover:text-indigo-300 p-1 bg-indigo-900/20 rounded disabled:opacity-30"
                                                title="Notificar divulgadoras via Push"
                                            >
                                                {notifyingPostId === post.id ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <FaceIdIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">Criado por: {post.createdByEmail}</p>
                                        <div className="mt-3">
                                            <div className="flex justify-between text-xs text-gray-300 mb-1">
                                                <span>Efetivação</span>
                                                <span className="font-mono">{percentage}%</span>
                                            </div>
                                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                                                <div className={`h-1.5 rounded-full ${percentage > 50 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${percentage}%` }}></div>
                                            </div>
                                        </div>
                                        <div className="mt-auto pt-4 border-t border-gray-700/50 space-y-2">
                                            <button onClick={() => navigate(`/admin/posts/${post.id}`)} className="w-full px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold">Gerenciar Tarefas</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPosts;
