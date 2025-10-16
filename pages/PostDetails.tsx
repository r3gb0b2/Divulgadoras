import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostWithAssignments, deletePost } from '../services/postService';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!postId) {
            setError("ID da publicação não encontrado.");
            setIsLoading(false);
            return;
        }
        const fetchDetails = async () => {
            setIsLoading(true);
            try {
                const { post, assignments } = await getPostWithAssignments(postId);
                setPost(post);
                setAssignments(assignments.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [postId]);

    const handleDelete = async () => {
        if (!postId || !post) return;
        if (window.confirm(`Tem certeza que deseja deletar a publicação para "${post.campaignName}"? Esta ação é irreversível.`)) {
            setIsDeleting(true);
            try {
                await deletePost(postId);
                alert("Publicação deletada com sucesso.");
                navigate('/admin/posts');
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return 'Data inválida';
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const confirmationStats = {
        confirmed: assignments.filter(a => a.status === 'confirmed').length,
        total: assignments.length,
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center py-10">Carregando detalhes...</div>;
        if (error) return <div className="text-red-400 text-center py-10">{error}</div>;
        if (!post) return <div className="text-center py-10">Publicação não encontrada.</div>;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Post Info */}
                <div className="lg:col-span-1 bg-dark/70 p-4 rounded-lg self-start">
                    <h2 className="text-xl font-bold text-primary mb-4">{post.campaignName}</h2>
                    {post.type === 'image' && post.imageUrl && (
                        <a href={post.imageUrl} target="_blank" rel="noopener noreferrer">
                             <img src={post.imageUrl} alt="Arte da publicação" className="w-full rounded-md mb-4" />
                        </a>
                    )}
                    {post.type === 'text' && (
                        <div className="bg-gray-800 p-3 rounded-md mb-4">
                            <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{post.textContent}</pre>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold text-gray-200">Instruções:</h4>
                        <p className="text-gray-400 text-sm whitespace-pre-wrap">{post.instructions}</p>
                    </div>
                    <div className="mt-4 border-t border-gray-600 pt-4">
                        <p className="text-xs text-gray-500">Criado por: {post.createdByEmail}</p>
                        <p className="text-xs text-gray-500">Em: {formatDate(post.createdAt)}</p>
                    </div>
                </div>

                {/* Assignments List */}
                <div className="lg:col-span-2 bg-dark/70 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                         <h2 className="text-xl font-bold text-white">Divulgadoras Designadas</h2>
                         <div className="text-lg font-semibold">{confirmationStats.confirmed} / {confirmationStats.total} <span className="text-sm font-normal">Confirmado</span></div>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                             <thead className="bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Nome</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Data Confirmação</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-700">
                                {assignments.map(a => (
                                    <tr key={a.id}>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{a.promoterName}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                                            {a.status === 'confirmed' ? (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>
                                            ) : (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400">{formatDate(a.confirmedAt)}</td>
                                    </tr>
                                ))}
                             </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div>
             <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <div>
                     <button onClick={() => navigate('/admin/posts')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Todas as Publicações</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Detalhes da Publicação</h1>
                </div>
                <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                    {isDeleting ? 'Deletando...' : 'Deletar Publicação'}
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
            </div>
        </div>
    );
};

export default PostDetails;
