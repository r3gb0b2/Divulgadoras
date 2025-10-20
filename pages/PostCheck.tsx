import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment } from '../services/postService';
import { PostAssignment } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const PostAssignmentCard: React.FC<{ assignment: PostAssignment, onConfirm: (id: string) => Promise<void> }> = ({ assignment, onConfirm }) => {
    const post = assignment.post;
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState('');
    
    const handleConfirm = async () => {
        setIsConfirming(true);
        setError('');
        try {
            await onConfirm(assignment.id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsConfirming(false);
        }
    };

    const isExpired = post.expiresAt && (post.expiresAt as Timestamp).toDate() < new Date();
    const canSubmitProof = assignment.status === 'confirmed' && assignment.confirmedAt && !assignment.proofSubmittedAt;
    const proofSubmissionDeadline = assignment.confirmedAt ? new Date((assignment.confirmedAt as Timestamp).toDate().getTime() + 24 * 60 * 60 * 1000) : null;
    const isProofDeadlineMissed = proofSubmissionDeadline && proofSubmissionDeadline < new Date();

    const renderProofButton = () => {
        if (!canSubmitProof) return null;
        if (isProofDeadlineMissed && !post.allowLateSubmissions) {
            return <p className="text-sm font-semibold text-red-400">Prazo para envio do print expirado.</p>;
        }
        return (
            <Link
                to={`/proof/${assignment.id}`}
                className="inline-block w-full sm:w-auto text-center bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors"
            >
                Enviar Print
            </Link>
        );
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm space-y-3">
            <h3 className="font-bold text-lg text-primary">{post.campaignName}</h3>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            
            <div className="bg-gray-800/50 p-3 rounded-md space-y-3">
                {post.type === 'image' && post.mediaUrl && (
                    <img src={post.mediaUrl} alt="Arte da publicação" className="w-full max-w-sm mx-auto rounded-md" />
                )}
                {post.type === 'video' && post.mediaUrl && (
                    <video src={post.mediaUrl} controls className="w-full max-w-sm mx-auto rounded-md" />
                )}
                {post.type === 'text' && (
                    <p className="text-gray-300 whitespace-pre-wrap font-mono">{post.textContent}</p>
                )}
                <div>
                     <h4 className="font-semibold text-gray-200">Instruções:</h4>
                     <p className="text-gray-400 text-sm whitespace-pre-wrap">{post.instructions}</p>
                </div>
                {post.postLink && <div>
                    <h4 className="font-semibold text-gray-200">Link da publicação:</h4>
                    <a href={post.postLink} target='_blank' rel='noopener noreferrer' className="text-primary hover:underline text-sm">{post.postLink}</a>
                </div>}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-3 border-t border-gray-700">
                <div>
                    <p className="text-sm font-semibold">Status:
                        {assignment.proofSubmittedAt ? <span className="ml-2 text-green-400">Comprovação Enviada</span> :
                         assignment.status === 'confirmed' ? <span className="ml-2 text-yellow-400">Aguardando Print</span> :
                         <span className="ml-2 text-blue-400">Pendente de Confirmação</span>
                        }
                    </p>
                    {isExpired && !assignment.proofSubmittedAt && <p className="text-xs text-red-400">Esta publicação expirou.</p>}
                </div>
                
                <div className="w-full sm:w-auto">
                    {assignment.status === 'pending' && !isExpired && (
                        <button
                            onClick={handleConfirm}
                            disabled={isConfirming}
                            className="w-full sm:w-auto px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50"
                        >
                            {isConfirming ? 'Confirmando...' : 'Confirmar Postagem'}
                        </button>
                    )}
                    {renderProofButton()}
                </div>
            </div>
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
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

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search]);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };

    const handleConfirmSuccess = (assignmentId: string) => {
        // Optimistically update the UI
        setAssignments(prev => {
            if (!prev) return null;
            return prev.map(a => 
                a.id === assignmentId ? { ...a, status: 'confirmed' as const, confirmedAt: Timestamp.now() } : a
            );
        });
        return Promise.resolve();
    }
    
    const renderStatusResult = () => {
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
            return <p className="text-center text-gray-400 mt-4">Nenhuma publicação pendente encontrada para este e-mail.</p>;
        }

        return (
            <div className="space-y-4">
                {assignments.map(a => <PostAssignmentCard key={a.id} assignment={a} onConfirm={async (id) => {await confirmAssignment(id); await handleConfirmSuccess(id);}} />)}
            </div>
        );
    };

    return (
        <div className="max-w-3xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver suas publicações pendentes.</p>
                
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
                        {isLoading ? 'Buscando...' : 'Buscar Publicações'}
                    </button>
                </form>
                
                <div className="mt-8">
                    {renderStatusResult()}
                </div>
            </div>
        </div>
    );
};

export default PostCheck;
