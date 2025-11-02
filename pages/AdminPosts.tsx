import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg, getAssignmentsForOrganization } from '../services/postService';
import { getOrganizations } from '../services/organizationService';
import { Post, Organization, PostAssignment } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, MegaphoneIcon } from '../components/Icons';
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
                const postPromise = getPostsForOrg(orgId);
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
                                <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                {post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{post.eventName}</p>}
                                <div className="flex items-center gap-3 text-sm text-gray-400 mt-2">
                                    <span className="capitalize">{post.type}</span>
                                    <span>-</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${post.isActive ? 'bg-green-900/50 text-green-300' : 'bg-gray-600 text-gray-400'}`}>
                                        {post.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>

                                <div className="mt-auto pt-4 border-t border-gray-700/50 mt-4">
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
