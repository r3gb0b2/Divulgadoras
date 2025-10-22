import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg } from '../services/postService';
import { getOrganizations } from '../services/organizationService';
import { Post, Organization } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
// FIX: Removed modular signOut import to use compat syntax.
import { auth } from '../firebase/config';

const AdminPosts: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    const [posts, setPosts] = useState<Post[]>([]);
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
                const orgPromise = isSuperAdmin ? getOrganizations() : Promise.resolve([]);
                
                const [fetchedPosts, fetchedOrgs] = await Promise.all([postPromise, orgPromise]);

                setPosts(fetchedPosts);
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
            // FIX: Use compat signOut method.
            await auth.signOut();
            // The auth context listener will handle navigation
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
        return date.toLocaleDateString('pt-BR');
    };

    const filteredPosts = useMemo(() => {
        switch (statusFilter) {
            case 'active':
                return posts.filter(p => p.isActive);
            case 'inactive':
                return posts.filter(p => !p.isActive);
            default:
                return posts;
        }
    }, [posts, statusFilter]);
    
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
            <div className="space-y-4">
                {filteredPosts.map(post => (
                    <div key={post.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start">
                            <div>
                                {isSuperAdmin && <p className="text-xs font-semibold text-gray-400">{orgNameMap[post.organizationId] || 'Organização Desconhecida'}</p>}
                                <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                {post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{post.eventName}</p>}
                                <div className="flex items-center gap-3 text-sm text-gray-400">
                                    <span>{post.type === 'image' ? 'Imagem' : (post.type === 'video' ? 'Vídeo' : 'Texto')} - Criado em: {formatDate(post.createdAt)}</span>
                                     <span className={`text-xs px-2 py-0.5 rounded-full ${post.isActive ? 'bg-green-900/50 text-green-300' : 'bg-gray-600 text-gray-400'}`}>
                                        {post.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                    {post.expiresAt && <p className="text-xs text-yellow-400">Expira em: {formatDate(post.expiresAt)}</p>}
                                </div>
                            </div>
                            <button 
                                onClick={() => navigate(`/admin/posts/${post.id}`)}
                                className="mt-2 sm:mt-0 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm"
                            >
                                Ver Detalhes
                            </button>
                        </div>
                    </div>
                ))}
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
                     {adminData?.role === 'poster' && (
                        <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                            Sair
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg mb-4 w-fit">
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