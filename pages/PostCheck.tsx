import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { getApprovedEventsForPromoter } from '../services/promoterService';
import { getAssignmentsForOrganization } from '../services/postService';
import { updateAssignment } from '../services/postService';
import { Promoter, PostAssignment } from '../types';
import { ArrowLeftIcon, CheckCircleIcon, XCircleIcon } from '../components/Icons';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import StorageMedia from '../components/StorageMedia';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';

const PostCard: React.FC<{ assignment: PostAssignment, onUpdate: () => void }> = ({ assignment, onUpdate }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDeclining, setIsDeclining] = useState(false);
    const [justification, setJustification] = useState('');
    const [showJustificationInput, setShowJustificationInput] = useState(false);

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await updateAssignment(assignment.id, { status: 'confirmed', confirmedAt: serverTimestamp() });
            onUpdate();
        } catch (e) {
            console.error(e);
        } finally {
            setIsConfirming(false);
        }
    };

    const handleDecline = async () => {
        if (!justification.trim()) {
            alert('Por favor, informe o motivo de não poder postar.');
            return;
        }
        setIsDeclining(true);
        try {
            await updateAssignment(assignment.id, { status: 'pending', justification: justification.trim(), justificationStatus: 'pending' });
            onUpdate();
        } catch (e) {
            console.error(e);
        } finally {
            setIsDeclining(false);
            setShowJustificationInput(false);
        }
    };

    const isExpired = assignment.post.expiresAt && (assignment.post.expiresAt as Timestamp).toDate() < new Date();
    const canSubmitProof = assignment.status === 'confirmed' && !assignment.proofSubmittedAt && assignment.confirmedAt;

    return (
        <div className={`p-4 rounded-lg shadow-sm ${assignment.status === 'completed' ? 'bg-green-900/20' : 'bg-dark/70'}`}>
            <h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>
            <p className="text-xs text-gray-400 mb-2">Criado em: {(assignment.post.createdAt as Timestamp).toDate().toLocaleDateString('pt-BR')}</p>
            
            {(assignment.post.type === 'image' || assignment.post.type === 'video') && assignment.post.mediaUrl && (
                <div className="my-4">
                    <StorageMedia path={assignment.post.mediaUrl} type={assignment.post.type} className="w-full max-w-sm mx-auto rounded-md" controls={assignment.post.type === 'video'} />
                </div>
            )}
            {assignment.post.type === 'text' && (
                <div className="my-4 bg-gray-800 p-3 rounded-md">
                    <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre>
                </div>
            )}

            <div className="space-y-2">
                <h4 className="font-semibold text-gray-200">Instruções:</h4>
                <div className="bg-gray-800/50 p-3 rounded-md">
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700">
                {assignment.status === 'pending' && !assignment.justification && !isExpired && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        {!showJustificationInput ? (
                             <>
                                <button onClick={handleConfirm} disabled={isConfirming} className="flex-1 px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50">Confirmar Postagem</button>
                                <button onClick={() => setShowJustificationInput(true)} className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700">Não posso postar</button>
                             </>
                        ) : (
                            <div className="w-full">
                                <textarea value={justification} onChange={e => setJustification(e.target.value)} placeholder="Por que não pode postar?" rows={3} className="w-full p-2 bg-gray-700 rounded-md" />
                                <div className="flex gap-2 mt-2">
                                    <button onClick={handleDecline} disabled={isDeclining} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md disabled:opacity-50">Enviar Motivo</button>
                                    <button onClick={() => setShowJustificationInput(false)} className="px-4 py-2 bg-gray-600 text-white rounded-md">Cancelar</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                 {assignment.justification && (
                     <p className="text-sm text-yellow-300">Você enviou uma justificativa que está em análise.</p>
                 )}
                 {canSubmitProof && (
                    <Link to={`/proof/${assignment.id}`} className="block w-full text-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700">Enviar Comprovação</Link>
                 )}
                 {assignment.proofSubmittedAt && (
                     <div className="flex items-center gap-2 text-green-400 font-semibold">
                         <CheckCircleIcon className="w-6 h-6" />
                         <span>Comprovação enviada com sucesso!</span>
                     </div>
                 )}
            </div>
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isStatsModalOpen, setStatsModalOpen] = useState(false);

    const performSearch = async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError('');
        try {
            const promoterEntries = await getApprovedEventsForPromoter(searchEmail);
            if (!promoterEntries || promoterEntries.length === 0) {
                 navigate(`/status?email=${encodeURIComponent(searchEmail)}`);
                 return;
            }
            setPromoter(promoterEntries[0]); // Use latest profile
            
            const orgIds = [...new Set(promoterEntries.map(p => p.organizationId))];
            const allAssignments: PostAssignment[] = [];
            for (const orgId of orgIds) {
                const orgAssignments = await getAssignmentsForOrganization(orgId);
                allAssignments.push(...orgAssignments.filter(a => a.promoterEmail.toLowerCase() === searchEmail.toLowerCase()));
            }

            allAssignments.sort((a,b) => (b.post.createdAt as Timestamp).toMillis() - (a.post.createdAt as Timestamp).toMillis());
            setAssignments(allAssignments);

        } catch (err: any) {
            setError(err.message);
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
    }, [location.search, navigate]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
             <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail para ver os posts que foram atribuídos a você.</p>
                <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
                        {isLoading ? 'Buscando...' : 'Buscar'}
                    </button>
                </form>

                {error && <p className="text-red-400 text-center">{error}</p>}

                {assignments.length > 0 && (
                     <div className="border-t border-gray-700 pt-6">
                        <div className="flex justify-between items-center mb-4">
                           <h2 className="text-xl font-bold">Publicações Atribuídas</h2>
                           <button onClick={() => setStatsModalOpen(true)} className="text-sm text-primary hover:underline">Ver minhas estatísticas</button>
                        </div>
                        <div className="space-y-4">
                           {assignments.map(a => <PostCard key={a.id} assignment={a} onUpdate={() => performSearch(email)} />)}
                        </div>
                     </div>
                )}
             </div>
             <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
