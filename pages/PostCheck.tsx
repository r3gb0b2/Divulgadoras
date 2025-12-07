import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, scheduleWhatsAppReminder } from '../services/postService';
import { PostAssignment } from '../types';
import { ArrowLeftIcon, SearchIcon, CameraIcon } from '../components/Icons';
import StorageMedia from '../components/StorageMedia';
import firebase from 'firebase/compat/app';

const PostCheck: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null); // Track which assignment is being processed
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailParam = queryParams.get('email');
        if (emailParam) {
            setEmail(emailParam);
            performSearch(emailParam);
        }
    }, [location.search]);

    const performSearch = async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setSearched(true);
        try {
            const data = await getAssignmentsForPromoterByEmail(searchEmail);
            setAssignments(data);
        } catch (err: any) {
            setError(err.message || "Erro ao buscar tarefas.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };

    const handleConfirmAssignment = async (assignment: PostAssignment) => {
        if (processingId) return; // Prevent double clicks globally

        const wantsReminder = window.confirm(
            "Você postou? Ótimo! Seu próximo passo é enviar o print em 6 horas.\n\nDeseja que a gente te lembre no WhatsApp?"
        );

        setProcessingId(assignment.id);

        try {
            // 1. First, confirm the assignment (Primary Action)
            await confirmAssignment(assignment.id);

            // 2. If requested, schedule the reminder via Cloud Function
            if (wantsReminder) {
                await scheduleWhatsAppReminder(assignment.id);
                // Optimistically update UI state without a second DB write from frontend
                setAssignments(prev => prev.map(a => 
                    a.id === assignment.id 
                        ? { ...a, status: 'confirmed', whatsAppReminderRequestedAt: firebase.firestore.Timestamp.now() } 
                        : a
                ));
                alert("Confirmado! Lembrete agendado para daqui a 6 horas.");
            } else {
                // Just update status locally
                setAssignments(prev => prev.map(a => 
                    a.id === assignment.id 
                        ? { ...a, status: 'confirmed' } 
                        : a
                ));
                alert("Postagem confirmada!");
            }

            // Optional: Refresh full list in background to ensure sync
            performSearch(email); 

        } catch (err: any) {
            console.error(err);
            alert((err as Error).message);
        } finally {
            setProcessingId(null);
        }
    };

    const renderContent = () => {
        if (!searched) return null;
        if (isLoading) return <div className="text-center py-8">Carregando...</div>;
        if (error) return <p className="text-red-400 text-center">{error}</p>;
        if (assignments.length === 0) return <p className="text-gray-400 text-center py-8">Nenhuma postagem pendente encontrada.</p>;

        return (
            <div className="space-y-6">
                {assignments.map(assignment => (
                    <div key={assignment.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="w-full md:w-1/3">
                                {assignment.post && (
                                    <StorageMedia 
                                        path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} 
                                        type={assignment.post.type === 'text' ? 'image' : assignment.post.type} 
                                        className="w-full h-40 object-cover rounded-md bg-gray-900" 
                                    />
                                )}
                            </div>
                            <div className="w-full md:w-2/3 flex flex-col justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-white">{assignment.post?.campaignName}</h3>
                                    {assignment.post?.eventName && <p className="text-sm text-primary">{assignment.post.eventName}</p>}
                                    <p className="text-gray-400 text-sm mt-2 whitespace-pre-wrap">{assignment.post?.instructions}</p>
                                </div>
                                <div className="mt-4 flex gap-3">
                                    {assignment.proofSubmittedAt ? (
                                        <span className="px-4 py-2 bg-green-900/50 text-green-300 rounded-md text-sm font-semibold w-full text-center">Concluído</span>
                                    ) : assignment.status === 'confirmed' ? (
                                        <Link to={`/proof/${assignment.id}`} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold text-sm">
                                            <CameraIcon className="w-4 h-4" />
                                            Enviar Print
                                        </Link>
                                    ) : (
                                        <button 
                                            onClick={() => handleConfirmAssignment(assignment)} 
                                            disabled={processingId === assignment.id}
                                            className={`flex-1 px-4 py-2 text-white rounded-md font-semibold text-sm ${processingId === assignment.id ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                        >
                                            {processingId === assignment.id ? 'Processando...' : 'Já Postei'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
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
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-6">Minhas Postagens</h1>
                <form onSubmit={handleSubmit} className="flex gap-4 mb-8">
                    <div className="relative flex-grow">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon className="h-5 w-5 text-gray-400" />
                        </span>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="Seu e-mail de cadastro" 
                            className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                            required
                        />
                    </div>
                    <button type="submit" disabled={isLoading} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50">
                        {isLoading ? '...' : 'Buscar'}
                    </button>
                </form>
                {renderContent()}
            </div>
        </div>
    );
};

export default PostCheck;