import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostWithAssignments, deletePost, updatePost } from '../services/postService';
import { Post, PostAssignment } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const timestampToInputDate = (ts: Timestamp | undefined | null | any): string => {
    if (!ts) return '';
    let date;
    // Handle Firestore Timestamp object from SDK
    if (ts.toDate) {
        date = ts.toDate();
    }
    // Handle serialized Timestamp from cloud function or from malformed db entry
    else if (typeof ts === 'object' && (ts.seconds || ts._seconds)) {
        const seconds = ts.seconds || ts._seconds;
        date = new Date(seconds * 1000);
    }
    // Handle string date
    else {
        date = new Date(ts);
    }
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

const PostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    
    // Edit state
    const [isActive, setIsActive] = useState(false);
    const [expiresAt, setExpiresAt] = useState('');

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchDetails = async () => {
        if (!postId) {
            setError("ID da publicação não encontrado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const { post, assignments } = await getPostWithAssignments(postId);
            setPost(post);
            setIsActive(post.isActive);
            setExpiresAt(timestampToInputDate(post.expiresAt));
            setAssignments(assignments.sort((a,b) => a.promoterName.localeCompare(b.promoterName)));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();
    }, [postId]);

    const handleSaveChanges = async () => {
        if (!postId) return;
        setIsSaving(true);
        setError(null);
        try {
            let expiryTimestamp: Timestamp | null = null;
            if (expiresAt) {
                const [year, month, day] = expiresAt.split('-').map(Number);
                const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
                expiryTimestamp = Timestamp.fromDate(expiryDate);
            }
            
            const updateData: Partial<Post> = {
                isActive,
                expiresAt: expiryTimestamp,
            };

            await updatePost(postId, updateData);
            alert('Publicação atualizada com sucesso!');
            await fetchDetails(); // Refresh data to confirm changes
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };


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
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const confirmationStats = {
        confirmed: assignments.filter(a => a.status === 'confirmed').length,
        total: assignments.length,
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center py-10">Carregando detalhes...</div>;
        if (error && !post) return <div className="text-red-400 text-center py-10">{error}</div>;
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

                    <div className="mt-4 border-t border-gray-600 pt-4 space-y-4">
                        <h4 className="font-semibold text-gray-200">Gerenciamento</h4>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Post Ativo</span>
                        </label>
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Data Limite (opcional)</label>
                            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                        </div>
                        <button onClick={handleSaveChanges} disabled={isSaving} className="w-full px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
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
                    disabled={isDeleting || isSaving}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                    {isDeleting ? 'Deletando...' : 'Deletar Publicação'}
                </button>
            </div>
             {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
            </div>
        </div>
    );
};

export default PostDetails;