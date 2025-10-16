import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg } from '../services/postService';
import { getOrganizations } from '../services/organizationService';
import { Post, Organization } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const AdminPosts: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        const fetchPosts = async () => {
            if (!adminData) return;
            
            setIsLoading(true);
            setError(null);
            
            const orgId = isSuperAdmin ? undefined : adminData.organizationId;

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
    }, [adminData, isSuperAdmin]);

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
        } else if (typeof timestamp === 'object' && timestamp._seconds) {
            // Handle serialized Timestamp from cloud function or from malformed db entry
            date = new Date(timestamp._seconds * 1000);
        } else {
            // Handle string date
            date = new Date(timestamp);
        }
        if (isNaN(date.getTime())) return 'Data inválida';
        return date.toLocaleDateString('pt-BR');
    };
    
    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center py-10">Carregando publicações...</div>;
        }
        if (error) {
            return <div className="text-red-400 text-center py-10">{error}</div>;
        }
        if (posts.length === 0) {
            return <div className="text-center text-gray-400 py-10">Nenhuma publicação criada ainda.</div>;
        }
        return (
            <div className="space-y-4">
                {posts.map(post => (
                    <div key={post.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start">
                            <div>
                                {isSuperAdmin && <p className="text-xs font-semibold text-gray-400">{orgNameMap[post.organizationId] || 'Organização Desconhecida'}</p>}
                                <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                <div className="flex items-center gap-3 text-sm text-gray-400">
                                    <span>{post.type === 'image' ? 'Imagem' : 'Texto'} - Criado em: {formatDate(post.createdAt)}</span>
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
                    <button onClick={() => navigate('/admin')} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                        <ArrowLeftIcon className="w-4 h-4" />
                        <span>Voltar ao Painel</span>
                    </button>
                    {!isSuperAdmin && (
                        <button 
                            onClick={() => navigate('/admin/posts/new')}
                            className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark"
                        >
                            + Nova Publicação
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminPosts;
