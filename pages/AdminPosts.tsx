import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostsForOrg } from '../services/postService';
import { Post } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const AdminPosts: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPosts = async () => {
            if (!adminData?.organizationId) {
                setError("Organização não encontrada para este admin.");
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const fetchedPosts = await getPostsForOrg(adminData.organizationId);
                setPosts(fetchedPosts);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPosts();
    }, [adminData]);

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
                                <p className="font-bold text-lg text-primary">{post.campaignName}</p>
                                <p className="text-sm text-gray-400">
                                    {post.type === 'image' ? 'Imagem' : 'Texto'} - Criado em: {formatDate(post.createdAt)}
                                </p>
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
                    <button 
                        onClick={() => navigate('/admin/posts/new')}
                        className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark"
                    >
                        + Nova Publicação
                    </button>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminPosts;
