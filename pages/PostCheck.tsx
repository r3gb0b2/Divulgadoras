import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment } from '../services/postService';
import { PostAssignment } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const PostCard: React.FC<{ assignment: PostAssignment, onConfirm: (assignmentId: string) => void }> = ({ assignment, onConfirm }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    
    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await onConfirm(assignment.id);
        } finally {
            setIsConfirming(false);
        }
    };

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return 'Data inválida';
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-3">
                <p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>
                {assignment.status === 'confirmed' ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>
                ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
                )}
            </div>
            
            <div className="border-t border-gray-700 pt-3">
                {assignment.post.type === 'image' && assignment.post.imageUrl && (
                    <a href={assignment.post.imageUrl} target="_blank" rel="noopener noreferrer">
                        <img src={assignment.post.imageUrl} alt="Arte da publicação" className="w-full max-w-sm mx-auto rounded-md mb-4" />
                    </a>
                )}
                {assignment.post.type === 'text' && (
                    <div className="bg-gray-800 p-3 rounded-md mb-4">
                        <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre>
                    </div>
                )}
                <div>
                    <h4 className="font-semibold text-gray-200">Instruções:</h4>
                    <p className="text-gray-400 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>
                </div>

                <div className="mt-4 border-t border-gray-700 pt-4 text-center">
                    {assignment.status === 'pending' ? (
                        <button 
                            onClick={handleConfirm}
                            disabled={isConfirming}
                            className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                            {isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}
                        </button>
                    ) : (
                        <p className="text-sm text-green-400">Confirmado em: {formatDate(assignment.confirmedAt)}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

const PostCheck: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<PostAssignment[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    const performSearch = async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setAssignments(null);
        setSearched(true);
        try {
            const result = await getAssignmentsForPromoterByEmail(searchEmail);
            setAssignments(result);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmPost = async (assignmentId: string) => {
        try {
            await confirmAssignment(assignmentId);
            // Refresh the list to show the updated status
            await performSearch(email);
        } catch (err: any) {
            setError(err.message || 'Falha ao confirmar.');
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };

    const renderResult = () => {
        if (!searched) return null;
        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            );
        }
        if (error) return <p className="text-red-500 mt-4 text-center">{error}</p>;
        if (!assignments || assignments.length === 0) {
            return <p className="text-center text-gray-400 mt-4">Nenhuma publicação encontrada para este e-mail.</p>;
        }
        return (
            <div className="space-y-4">
                {assignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirmPost} />)}
            </div>
        );
    }
    
    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Publicações para Divulgação</h1>
                <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver os posts que você precisa publicar.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                        {isLoading ? 'Verificando...' : 'Verificar'}
                    </button>
                </form>
                
                <div className="mt-8">
                    {renderResult()}
                </div>
            </div>
        </div>
    );
};

export default PostCheck;
