import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment } from '../types';
import { ArrowLeftIcon, EyeIcon, DownloadIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const ProofSection: React.FC<{ assignment: PostAssignment }> = ({ assignment }) => {
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState('');
    const [isButtonEnabled, setIsButtonEnabled] = useState(false);

    useEffect(() => {
        if (!assignment.confirmedAt) return;

        const confirmationTime = (assignment.confirmedAt as Timestamp).toDate();
        const enableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000); // 6 hours
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        const timer = setInterval(() => {
            const now = new Date();

            if (now > expireTime) {
                setTimeLeft('Tempo esgotado');
                setIsButtonEnabled(false);
                clearInterval(timer);
                return;
            }

            if (now < enableTime) {
                const diff = enableTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`Disponível em: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setIsButtonEnabled(false);
            } else {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`Expira em: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setIsButtonEnabled(true);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [assignment.confirmedAt]);

    if (assignment.proofImageUrls && assignment.proofImageUrls.length > 0) {
        return (
            <div className="mt-4 text-center">
                <p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>
                <div className="flex justify-center gap-2">
                    {assignment.proofImageUrls.map((url, index) => (
                        <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" />
                        </a>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="mt-4 text-center">
            <button
                onClick={() => navigate(`/proof/${assignment.id}`)}
                disabled={!isButtonEnabled}
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Comprovação de Postagem
            </button>
            <p className="text-xs text-gray-400 mt-2">{timeLeft}</p>
        </div>
    );
};


const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignmentId: string) => void }> = ({ assignment, onConfirm }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    
    if (!assignment.promoterHasJoinedGroup) {
        return (
            <div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500">
                <h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>
                <p className="mt-2 text-yellow-300">
                    Você tem uma nova publicação para este evento!
                </p>
                <p className="mt-2 text-gray-300 text-sm">
                    Para visualizar, primeiro você precisa confirmar a leitura das regras e entrar no grupo do WhatsApp.
                </p>
                <div className="mt-4 text-center">
                    <Link 
                        to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`}
                        className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors"
                    >
                        Verificar Status e Aceitar Regras
                    </Link>
                </div>
            </div>
        );
    }

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await onConfirm(assignment.id);
        } finally {
            setIsConfirming(false);
        }
    };

    const handleCopyLink = () => {
        if (!assignment.post.postLink) return;
        navigator.clipboard.writeText(assignment.post.postLink).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000); // Reset after 2 seconds
        }).catch(err => {
            console.error('Failed to copy link: ', err);
            alert('Falha ao copiar link.');
        });
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
                {assignment.post.type === 'image' && assignment.post.mediaUrl && (
                    <div className="mb-4">
                        <a href={assignment.post.mediaUrl} target="_blank" rel="noopener noreferrer">
                            <img src={assignment.post.mediaUrl} alt="Arte da publicação" className="w-full max-w-sm mx-auto rounded-md" />
                        </a>
                        <div className="flex justify-center items-center gap-4 mt-2">
                            <a href={assignment.post.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                                <EyeIcon className="w-4 h-4" /> Ver
                            </a>
                            <a href={assignment.post.mediaUrl} download className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                                <DownloadIcon className="w-4 h-4" /> Baixar
                            </a>
                        </div>
                    </div>
                )}
                {assignment.post.type === 'video' && assignment.post.mediaUrl && (
                    <div className="mb-4">
                        <video src={assignment.post.mediaUrl} controls className="w-full max-w-sm mx-auto rounded-md" />
                        <div className="flex justify-center items-center gap-4 mt-2">
                             <a href={assignment.post.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                                <EyeIcon className="w-4 h-4" /> Ver
                            </a>
                            <a href={assignment.post.mediaUrl} download className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                                <DownloadIcon className="w-4 h-4" /> Baixar
                            </a>
                        </div>
                    </div>
                )}
                {assignment.post.type === 'text' && (
                    <div className="bg-gray-800 p-3 rounded-md mb-4">
                        <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre>
                    </div>
                )}

                <div className="space-y-2">
                    <h4 className="font-semibold text-gray-200">Instruções:</h4>
                    <div className="bg-gray-800/50 p-3 rounded-md">
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>
                    </div>
                </div>

                {assignment.post.postLink && (
                    <div className="space-y-2 mt-4">
                        <h4 className="font-semibold text-gray-200">Link para Postagem:</h4>
                        <div className="bg-gray-800/50 p-3 rounded-md">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={assignment.post.postLink}
                                    className="flex-grow w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-sm"
                                />
                                <button
                                    onClick={handleCopyLink}
                                    className="flex-shrink-0 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold w-24"
                                >
                                    {linkCopied ? 'Copiado!' : 'Copiar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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
                        <ProofSection assignment={assignment} />
                    )}
                </div>
            </div>
        </div>
    );
}

const PostCheck: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[] | null>(null);
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
            const [assignmentsResult, promoterProfiles] = await Promise.all([
                getAssignmentsForPromoterByEmail(searchEmail),
                findPromotersByEmail(searchEmail),
            ]);

            const campaignStatusMap = new Map<string, boolean>();
            if (promoterProfiles) {
                for (const profile of promoterProfiles) {
                    // We only care about the status for campaigns they have been approved for
                    if (profile.campaignName && profile.status === 'approved') {
                        // The latest registration for a campaign will be first due to sorting in findPromotersByEmail
                        if (!campaignStatusMap.has(profile.campaignName)) {
                            campaignStatusMap.set(profile.campaignName, profile.hasJoinedGroup || false);
                        }
                    }
                }
            }

            const assignmentsWithStatus = assignmentsResult.map(assignment => ({
                ...assignment,
                promoterHasJoinedGroup: campaignStatusMap.get(assignment.post.campaignName) || false,
            }));

            setAssignments(assignmentsWithStatus);
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