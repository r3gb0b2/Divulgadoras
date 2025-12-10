import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg, getAssignmentsForOrganization, updatePost } from '../services/postService';
import { getOrganization, getOrganizations } from '../services/organizationService';
import { Post, Organization, PostAssignment } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, MegaphoneIcon, DocumentDuplicateIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import { auth } from '../firebase/config';
import StorageMedia from '../components/StorageMedia';

// Helper to safely convert various date formats to a Date object
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
};

const AdminPosts: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        const fetchPosts = async () => {
            if (!adminData) return;
            
            setIsLoading(true);
            setError(null);
            
            const orgId = isSuperAdmin ? undefined : selectedOrgId;

            if (!isSuperAdmin && !orgId) {
                setError("Organização não encontrada para este admin.");
                setIsLoading(false);
                return;
            }

            try {
                let isOwner = false;
                if (orgId) {
                    const orgData = (await getOrganization(orgId));
                    if (orgData?.ownerUid === adminData.uid) {
                        isOwner = true;
                    }
                }

                const postPromise = getPostsForOrg(orgId, isOwner || isSuperAdmin);
                const assignmentsPromise = orgId ? getAssignmentsForOrganization(orgId) : Promise.resolve([]);
                const orgPromise = isSuperAdmin ? getOrganizations() : Promise.resolve([]);
                
                const [fetchedPosts, fetchedAssignments, fetchedOrgs] = await Promise.all([postPromise, assignmentsPromise, orgPromise]);

                setPosts(fetchedPosts);
                setAssignments(fetchedAssignments);
                setOrganizations(fetchedOrgs);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPosts();
    }, [adminData, isSuperAdmin, selectedOrgId]);

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/admin/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const orgNameMap = useMemo(() => {
        if (!isSuperAdmin) return {};
        return organizations.reduce((acc, org) => {
            acc[org.id] = org.name;
            return acc;
        }, {} as Record<string, string>);
    }, [organizations, isSuperAdmin]);
    
    const pendingJustificationsMap = useMemo(() => {
        const map = new Map<string, number>();
        assignments.forEach(a => {
            if (a.justificationStatus === 'pending') {
                map.set(a.postId, (map.get(a.postId) || 0) + 1);
            }
        });
        return map;
    }, [assignments]);

    const postStatsMap = useMemo(() => {
        const map = new Map<string, { total: number, completed: number }>();
        assignments.forEach(a => {
            const current = map.get(a.postId) || { total: 0, completed: 0 };
            current.total++;
            // Considera efetivo se enviou print OU teve justificativa aceita
            if (a.proofSubmittedAt || a.justificationStatus === 'accepted') {
                current.completed++;
            }
            map.set(a.postId, current);
        });
        return map;
    }, [assignments]);


    const { activePosts, inactivePosts } = useMemo(() => {
        const now = new Date();
        const active: Post[] = [];
        const inactive: Post[] = [];

        posts.forEach(p => {
            const isExpired = p.expiresAt && toDateSafe(p.expiresAt) < now;
            if (p.isActive && !isExpired) {
                active.push(p);
            } else {
                inactive.push(p);
            }
        });
        return { activePosts: active, inactivePosts: inactive };
    }, [posts]);

    const filteredPosts = useMemo(() => {
        switch (statusFilter) {
            case 'active':
                return activePosts;
            case 'inactive':
                return inactivePosts;
            default:
                return posts;
        }
    }, [posts, activePosts, inactivePosts, statusFilter]);

    const handleToggleActive = async (post: Post) => {
        try {
            const newActiveState = !post.isActive;
            const updateData: Partial<Post> = { isActive: newActiveState };

            // If deactivating, force auto-assign to false
            if (!newActiveState) {
                updateData.autoAssignToNewPromoters = false;
            }

            // Optimistic update locally
            setPosts(prev => prev.map(p => {
                if (p.id === post.id) {
                    return { ...p, ...updateData };
                }
                return p;
            }));
            
            // Call API
            await updatePost(post.id, updateData);
        } catch (e: any) {
            alert("Erro ao atualizar status do post: " + e.message);
            // Revert on error
            setPosts(prev => prev.map(p => p.id === post.id ? post : p));
        }
    }

    const handleToggleJustification = async (post: Post) => {
        try {
            const newVal = post.allowJustification === false ? true : false;
            // Optimistic update locally
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, allowJustification: newVal } : p));
            
            // Call API
            await updatePost(post.id, { allowJustification: newVal });
        } catch (e: any) {
            alert("Erro ao atualizar permissão de justificativa: " + e.message);
            // Revert on error
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, allowJustification: post.allowJustification } : p));
        }
    }

    const handleToggleAutoAssign = async (post: Post) => {
        try {
            // Cannot enable auto-assign if post is inactive
            if (!post.isActive && !post.autoAssignToNewPromoters) {
                alert("Você precisa ativar a postagem antes de habilitar a atribuição automática.");
                return;
            }

            const newVal = !post.autoAssignToNewPromoters;
            // Optimistic update locally
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, autoAssignToNewPromoters: newVal } : p));
            
            // Call API
            await updatePost(post.id, { autoAssignToNewPromoters: newVal });
        } catch (e: any) {
            alert("Erro ao atualizar atribuição automática: " + e.message);
            // Revert on error
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, autoAssignToNewPromoters: post.autoAssignToNewPromoters } : p));
        }
    }
    
    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center py-10">Carregando publicações...</div>;
        }
        if (error) {
            return <div className="text-red-400 text-center py-10">{error}</div>;
        }
        if (filteredPosts.length === 0) {
            return (
                <div className="text-center text-gray-400 py-10">
                    {statusFilter === 'active' && 'Nenhuma publicação ativa encontrada.'}
                    {statusFilter === 'inactive' && 'Nenhuma publicação inativa encontrada.'}
                    {statusFilter === 'all' && posts.length === 0 && 'Nenhuma publicação criada ainda.'}
                    {statusFilter === 'all' && posts.length > 0 && 'Nenhuma publicação encontrada com os filtros atuais.'}
                </div>
            );
        }
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPosts.map(post => {
                    const pendingCount = pendingJustificationsMap.get(post.id) || 0;
                    const stats = postStatsMap.get(post.id) || { total: 0, completed: 0 };
                    const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

                    return (
                        <div key={post.id} className="bg-dark/70 rounded-lg shadow-sm flex flex-col overflow-hidden border border-gray-700/50">
                            <div className="relative">
                                <StorageMedia 
                                    path={post.mediaUrl || ''} 
                                    type={post.type === 'text' ? 'image' : post.type} // Fallback to image for text posts to show placeholder
                                    className="h-40 w-full object-cover bg-gray-800"
                                    alt={`Arte para ${post.campaignName}`}
                                />
                                {pendingCount > 0 && (
                                     <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                        <MegaphoneIcon className="w-4 h-4" />
                                        {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 flex flex-col flex-grow">
                                {isSuperAdmin && <p className="text-xs font-semibold text-gray-400">{orgNameMap[post.organizationId] || 'Organização Desconhecida'}</p>}
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                        {post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{post.eventName}</p>}
                                    </div>
                                    <button 
                                        onClick={() => navigate('/admin/posts/new?fromPost=' + post.id)}
                                        className="text-gray-400 hover:text-white"
                                        title="Duplicar para outro evento"
                                    >
                                        <DocumentDuplicateIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-400 mt-2">
                                    <span className="capitalize">{post.type === 'text' ? 'Interação' : post.type}</span>
                                    <span>-</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${post.isActive ? 'bg-green-900/50 text-green-300' : 'bg-gray-600 text-gray-400'}`}>
                                        {post.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>
                                
                                {/* Effectiveness Percentage Bar */}
                                <div className="mt-3 mb-1">
                                    <div className="flex justify-between text-xs text-gray-300 mb-1">
                                        <span>Efetivação</span>
                                        <span className="font-mono">{percentage}% ({stats.completed}/{stats.total})</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                        <div 
                                            className={`${getProgressBarColor(percentage)} h-2 rounded-full transition-all duration-500`} 
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-500 mt-2">Criado por: {post.createdByEmail}</p>

                                <div className="mt-auto pt-4 border-t border-gray-700/50 mt-4 space-y-3">
                                     {/* Toggle for Active Status */}
                                     <label className="flex items-center space-x-2 text-sm cursor-pointer text-gray-300 hover:text-white">
                                        <input 
                                            type="checkbox" 
                                            checked={post.isActive} 
                                            onChange={() => handleToggleActive(post)}
                                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                        />
                                        <span className={post.isActive ? 'text-green-400 font-medium' : ''}>Postagem Ativa</span>
                                     </label>

                                     {/* Toggle for Auto Assign */}
                                     <label className={`flex items-center space-x-2 text-sm cursor-pointer ${!post.isActive ? 'opacity-50' : 'text-gray-300 hover:text-white'}`}>
                                        <input 
                                            type="checkbox" 
                                            checked={!!post.autoAssignToNewPromoters} 
                                            onChange={() => handleToggleAutoAssign(post)}
                                            disabled={!post.isActive}
                                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary disabled:cursor-not-allowed"
                                        />
                                        <span>Atribuir a novas divulgadoras</span>
                                     </label>

                                     {/* Toggle for Justifications */}
                                     <label className="flex items-center space-x-2 text-sm cursor-pointer text-gray-300 hover:text-white">
                                        <input 
                                            type="checkbox" 
                                            checked={post.allowJustification !== false} 
                                            onChange={() => handleToggleJustification(post)}
                                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                        />
                                        <span>Aceitar Justificativas</span>
                                     </label>

                                     <button 
                                        onClick={() => navigate(`/admin/posts/${post.id}`)}
                                        className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold"
                                    >
                                        Ver Detalhes e Tarefas
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciamento de Posts</h1>
                <div className="flex items-center gap-4">
                    {adminData?.role !== 'poster' && (
                        <button onClick={() => navigate('/admin')} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                            <ArrowLeftIcon className="w-4 h-4" />
                            <span>Voltar ao Painel</span>
                        </button>
                    )}
                    {(adminData?.role === 'admin' || adminData?.role === 'poster' || adminData?.role === 'superadmin') && (
                        <button 
                            onClick={() => navigate('/admin/posts/new')}
                            className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark"
                        >
                            + Nova Publicação
                        </button>
                    )}
                     {adminData && (
                        <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                            Sair
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg mb-6 w-fit">
                    {(['active', 'inactive', 'all'] as const).map(f => (
                        <button 
                            key={f} 
                            onClick={() => setStatusFilter(f)} 
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                        >
                            {{'active': 'Ativos', 'inactive': 'Inativos', 'all': 'Todos'}[f]}
                        </button>
                    ))}
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminPosts;