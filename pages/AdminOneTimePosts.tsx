import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { OneTimePost } from '../types';
import { getOneTimePostsForOrg, deleteOneTimePost } from '../services/postService';
import { ArrowLeftIcon, LinkIcon, TrashIcon } from '../components/Icons';

const AdminOneTimePosts: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();

    const [posts, setPosts] = useState<OneTimePost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const data = await getOneTimePostsForOrg(selectedOrgId);
            setPosts(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCopyLink = (postId: string) => {
        const link = `${window.location.origin}/#/post-unico/${postId}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedLink(postId);
            setTimeout(() => setCopiedLink(null), 2500);
        }).catch(err => alert('Falha ao copiar o link.'));
    };
    
    const handleDelete = async (post: OneTimePost) => {
        if (window.confirm(`Tem certeza que deseja deletar o post "${post.campaignName} - ${post.eventName || ''}" e TODAS as suas ${post.submissionCount || 0} submissões? Esta ação é irreversível.`)) {
            try {
                await deleteOneTimePost(post.id);
                fetchData();
            } catch (err: any) {
                setError(err.message || "Falha ao deletar post.");
            }
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciar Posts Únicos</h1>
                 <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-gray-400">Crie posts com links compartilháveis para pessoas não cadastradas.</p>
                    <button onClick={() => navigate('/admin/one-time-posts/new')} className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark">
                        + Criar Post Único
                    </button>
                </div>
                 {error && <p className="text-red-400 mb-4">{error}</p>}
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome da Lista</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                         <tbody className="divide-y divide-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={4} className="text-center py-8">Carregando...</td></tr>
                            ) : posts.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-400">Nenhum post único criado.</td></tr>
                            ) : (
                                posts.map(post => (
                                    <tr key={post.id} className="hover:bg-gray-700/40">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <p className="font-medium text-white">{post.campaignName}</p>
                                            <p className="text-sm text-gray-400">{post.eventName}</p>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{post.guestListName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${post.isActive ? 'bg-green-900/50 text-green-300' : 'bg-gray-600 text-gray-400'}`}>
                                                {post.isActive ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end items-center gap-4">
                                                <button onClick={() => navigate(`/admin/one-time-posts/${post.id}`)} className="text-gray-300 hover:text-white" title="Ver Detalhes e Submissões">Ver Detalhes</button>
                                                <button onClick={() => handleCopyLink(post.id)} className="text-blue-400 hover:text-blue-300" title="Copiar Link Compartilhável">
                                                    {copiedLink === post.id ? 'Copiado!' : <LinkIcon className="w-5 h-5"/>}
                                                </button>
                                                <button onClick={() => handleDelete(post)} className="text-red-400 hover:text-red-300" title="Excluir"><TrashIcon className="w-5 h-5"/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                         </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminOneTimePosts;