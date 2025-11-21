
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter, updateAssignment } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon } from '../components/Icons';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import firebase from 'firebase/compat/app';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const extractGoogleDriveId = (url: string): string | null => {
    let id = null;
    const patterns = [ /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/, /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/, /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/ ];
    for (const pattern of patterns) { const match = url.match(pattern); if (match && match[1]) { id = match[1]; break; } }
    return id;
};

const isAssignmentActive = (assignment: PostAssignment): boolean => {
    // 1. Proof Submitted -> History (Done)
    if (assignment.proofSubmittedAt) return false;

    // 2. Justification Logic
    // If status is accepted or rejected, it's history.
    if (assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') {
        return false;
    }
    // If status is pending (or legacy justification exists without status), it's active.
    if (assignment.justificationStatus === 'pending' || assignment.justification) {
        return true;
    }

    // 3. Post Deactivated -> History
    if (!assignment.post.isActive) return false;

    // 4. Check Expiration
    const now = new Date();
    const expiresAt = toDateSafe(assignment.post.expiresAt);
    
    if (expiresAt && now > expiresAt) {
        // If late submissions allowed, it's still active
        if (assignment.post.allowLateSubmissions) return true;

        // If confirmed, check the 24h window from confirmation time
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if (confirmedAt) {
                const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                if (now < deadline) return true; // Still in window
            }
        }
        
        // Otherwise expired/missed -> History
        return false;
    }

    return true;
};

const CountdownTimer: React.FC<{ targetDate: any, onEnd?: () => void }> = ({ targetDate, onEnd }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);
    useEffect(() => {
        const target = toDateSafe(targetDate);
        if (!target) return;
        const updateTimer = () => {
            const now = new Date();
            const difference = target.getTime() - now.getTime();
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                setTimeLeft(timeString); setIsExpired(false);
            } else {
                setTimeLeft('Liberado!'); setIsExpired(true);
                if (onEnd) onEnd();
            }
        };
        updateTimer(); const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [targetDate, onEnd]);
    if (!timeLeft) return null;
    return <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-1 ${isExpired ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'}`}><ClockIcon className="h-4 w-4" /><span>{timeLeft}</span></div>;
};

const ProofSection: React.FC<{ assignment: PostAssignment, onJustify: (assignment: PostAssignment) => void }> = ({ assignment, onJustify }) => {
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState('');
    const [isButtonEnabled, setIsButtonEnabled] = useState(false);
    const allowJustification = assignment.post.allowJustification !== false;

    useEffect(() => {
        if (!assignment.confirmedAt) return;
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        const timer = setInterval(() => {
            const now = new Date();
            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) { setTimeLeft('Envio fora do prazo liberado pelo organizador.'); setIsButtonEnabled(true); } else { setTimeLeft('Tempo esgotado'); setIsButtonEnabled(false); }
                clearInterval(timer); return;
            }
            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setTimeLeft(`Envio liberado! Expira em: ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`);
                setIsButtonEnabled(true); return;
            }
            const enableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);
            if (now < enableTime) {
                const diff = enableTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`liberação para envio de print em ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
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
    }, [assignment.confirmedAt, assignment.post.allowLateSubmissions, assignment.post.allowImmediateProof]);

    if (assignment.proofImageUrls && assignment.proofImageUrls.length > 0) {
        return (<div className="mt-4 text-center"><p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p><div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div></div>);
    }
    const isExpired = timeLeft === 'Tempo esgotado';
    return (
        <div className="mt-4 text-center">
            {isExpired ? (
                allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full sm:w-auto px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)
            ) : (<button onClick={() => navigate(`/proof/${assignment.id}`)} disabled={!isButtonEnabled} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Comprovação de Postagem</button>)}
            <p className={`text-xs mt-2 ${isExpired ? 'text-red-400' : 'text-gray-400'}`}>{timeLeft}</p>
        </div>
    );
};

const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void }> = ({ assignment, onConfirm, onJustify }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isMediaProcessing, setIsMediaProcessing] = useState(false);
    const allowJustification = assignment.post.allowJustification !== false;

    if (!assignment.promoterHasJoinedGroup) return (<div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500"><h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}<p className="mt-2 text-yellow-300">Você tem uma nova publicação para este evento!</p><p className="mt-2 text-gray-300 text-sm">Para visualizar, primeiro você precisa confirmar a leitura das regras e entrar no grupo do WhatsApp.</p><div className="mt-4 text-center"><Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors">Verificar Status e Aceitar Regras</Link></div></div>);

    const handleConfirm = async () => { setIsConfirming(true); try { await onConfirm(assignment); } finally { setIsConfirming(false); } };
    const handleCopyLink = () => { if (!assignment.post.postLink) return; navigator.clipboard.writeText(assignment.post.postLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(err => { console.error('Failed to copy link: ', err); alert('Falha ao copiar link.'); }); };
    const now = new Date();
    const isExpired = assignment.post.expiresAt && toDateSafe(assignment.post.expiresAt) < now;
    const isPostDownloadable = assignment.post.isActive && !isExpired;
    
    const handleFirebaseDownload = async () => {
        if (!isPostDownloadable || isMediaProcessing || !assignment.post.mediaUrl) return;
        setIsMediaProcessing(true);
        try {
            const path = assignment.post.mediaUrl;
            let finalUrl = path;
            if (!path.startsWith('http')) { const storageRef = storage.ref(path); finalUrl = await storageRef.getDownloadURL(); }
            const link = document.createElement('a'); link.href = finalUrl; const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download'; link.setAttribute('download', filename); link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } catch (error: any) { console.error('Failed to download from Firebase:', error); alert(`Não foi possível baixar a mídia do Link 1: ${error.message}`); } finally { setIsMediaProcessing(false); }
    };
    const handleGoogleDriveDownload = () => { if (!isPostDownloadable || !assignment.post.googleDriveUrl) return; const { googleDriveUrl, type } = assignment.post; let urlToOpen = googleDriveUrl; if (type === 'video') { const fileId = extractGoogleDriveId(googleDriveUrl); if (fileId) { urlToOpen = `https://drive.google.com/uc?export=download&id=${fileId}`; } } window.open(urlToOpen, '_blank'); };
    
    const renderJustificationStatus = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => { 
        const styles = { pending: "bg-yellow-900/50 text-yellow-300", accepted: "bg-green-900/50 text-green-300", rejected: "bg-red-900/50 text-red-300" }; 
        const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" }; 
        const effectiveStatus = status || 'pending';
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[effectiveStatus]}`}>{text[effectiveStatus]}</span>; 
    };
    
    const hasProof = !!assignment.proofSubmittedAt;
    const hasJustification = !!assignment.justification;

    const renderActions = () => {
        if (hasProof) return (<div className="mt-4 text-center"><p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>{assignment.proofImageUrls && assignment.proofImageUrls.length > 0 ? (<div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div>) : (<p className="text-xs text-gray-400">(Concluído automaticamente)</p>)}</div>);
        
        if (hasJustification) {
            return (
                <div className="mt-4 text-center">
                    <p className="text-sm text-yellow-300 font-semibold mb-2">Justificativa Enviada</p>
                    <p className="text-sm italic text-gray-300 bg-gray-800 p-2 rounded-md mb-2">"{assignment.justification}"</p>
                    <div className="text-xs mb-2">Status: {renderJustificationStatus(assignment.justificationStatus)}</div>
                    {assignment.justificationResponse && (<div className="mt-2 text-left bg-dark p-3 rounded-md border-l-4 border-primary"><p className="text-sm font-semibold text-primary mb-1">Resposta do Organizador:</p><p className="text-sm text-gray-300 whitespace-pre-wrap">{assignment.justificationResponse}</p></div>)}
                </div>
            );
        }

        if (assignment.status === 'pending') {
            if (!assignment.post.isActive || isExpired) {
                return (<div className="w-full flex flex-col sm:flex-row gap-2">{allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)}</div>);
            }
            return (<div className="w-full flex flex-col sm:flex-row gap-2">{allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada ou não é permitida. Por favor, procure o administrador.")} className="w-full px-4 py-2 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)}<button onClick={handleConfirm} disabled={isConfirming} className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">{isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}</button></div>);
        }
        if (assignment.status === 'confirmed') return <ProofSection assignment={assignment} onJustify={onJustify} />;
        return null;
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-3"><div><p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}{assignment.post.postFormats && assignment.post.postFormats.length > 0 && (<div className="flex gap-2 mt-1">{assignment.post.postFormats.map(format => (<span key={format} className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-600 text-gray-200 capitalize">{format}</span>))}</div>)}</div><div className="flex flex-col items-end gap-1 flex-shrink-0">{assignment.post.expiresAt && (<div className="flex items-center gap-2"><span className="text-xs text-gray-400 font-medium">Tempo restante:</span><CountdownTimer targetDate={assignment.post.expiresAt} /></div>)}<div className="mt-1">{assignment.status === 'confirmed' ? (<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>) : (<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>)}</div></div></div>
            <div className="border-t border-gray-700 pt-3">
                {assignment.post.type === 'text' && (<div className="bg-gray-800 p-3 rounded-md mb-4"><pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre></div>)}
                {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                    <div className="mb-4"><StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} controls={assignment.post.type === 'video'} className="w-full max-w-sm mx-auto rounded-md" /><div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">{assignment.post.mediaUrl && (<button onClick={handleFirebaseDownload} disabled={isMediaProcessing} className={`flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold disabled:opacity-50 ${!isPostDownloadable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}`} title={!isPostDownloadable ? "Download desabilitado para posts inativos" : "Baixar do nosso servidor (Firebase)"}><DownloadIcon className="w-4 h-4" /><span>Download Link 1</span></button>)}{assignment.post.googleDriveUrl && (<button onClick={handleGoogleDriveDownload} disabled={!isPostDownloadable} className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold ${!isPostDownloadable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`} title={!isPostDownloadable ? "Download desabilitado para posts inativos" : "Baixar do Google Drive"}><DownloadIcon className="w-4 h-4" /><span>Download Link 2</span></button>)}</div>{assignment.post.mediaUrl && assignment.post.googleDriveUrl && (<p className="text-center text-xs text-gray-400 mt-2">Link 1 é do servidor da plataforma, Link 2 é do Google Drive.</p>)}</div>
                )}
                <div className="space-y-2"><h4 className="font-semibold text-gray-200">Instruções:</h4><div className="bg-gray-800/50 p-3 rounded-md"><p className="text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p></div></div>
                {assignment.post.postLink && (<div className="space-y-2 mt-4"><h4 className="font-semibold text-gray-200">Link para Postagem:</h4><div className="bg-gray-800/50 p-3 rounded-md"><div className="flex items-center gap-2"><input type="text" readOnly value={assignment.post.postLink} className="flex-grow w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-sm" /><button onClick={handleCopyLink} className="flex-shrink-0 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold w-24">{linkCopied ? 'Copiado!' : 'Copiar'}</button><a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm font-semibold"><ExternalLinkIcon className="w-4 h-4" /><span>Abrir</span></a></div></div></div>)}
            </div>
            {renderActions()}
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[]>([]);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [justificationAssignment, setJustificationAssignment] = useState<PostAssignment | null>(null);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setAssignments([]);
        setScheduledPosts([]);
        setSearched(true);
        try {
            const [promoterProfiles, fetchedAssignments, fetchedScheduled] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getAssignmentsForPromoterByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail)
            ]);

            if (promoterProfiles.length === 0) {
                setError("Nenhum cadastro encontrado com este e-mail.");
                setIsLoading(false);
                return;
            }
            
            setPromoter(promoterProfiles[0]); 

            const assignmentsWithGroupStatus = fetchedAssignments.map(assignment => {
                const promoterProfile = promoterProfiles.find(p => p.id === assignment.promoterId);
                return { ...assignment, promoterHasJoinedGroup: promoterProfile?.hasJoinedGroup || false };
            });

            setAssignments(assignmentsWithGroupStatus);
            setScheduledPosts(fetchedScheduled);

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao buscar.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search, performSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(`/posts?email=${encodeURIComponent(email)}`); 
    };

    const handleConfirmAssignment = async (assignment: PostAssignment) => {
        try {
            await confirmAssignment(assignment.id);
            performSearch(email);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleOpenJustification = (assignment: PostAssignment) => {
        setJustificationAssignment(assignment);
        setJustificationText('');
        setJustificationFiles([]);
    };

    const handleJustificationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setJustificationFiles(Array.from(e.target.files));
    };

    const handleSubmitJustification = async () => {
        if (!justificationAssignment) return;
        if (!justificationText.trim()) {
            alert("Por favor, explique o motivo.");
            return;
        }
        setIsSubmittingJustification(true);
        try {
            await submitJustification(justificationAssignment.id, justificationText, justificationFiles);
            setJustificationAssignment(null);
            performSearch(email);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsSubmittingJustification(false);
        }
    };

    const renderScheduledPosts = () => {
        if (scheduledPosts.length === 0) return null;
        return (
            <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-300 mb-4 flex items-center gap-2"><ClockIcon className="w-6 h-6" /> Em Breve</h2>
                <div className="space-y-4">
                    {scheduledPosts.map(post => (
                        <div key={post.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between">
                            <div>
                                <p className="font-semibold text-white">{post.postData.campaignName}</p>
                                <p className="text-sm text-gray-400">Agendado para: {toDateSafe(post.scheduledAt)?.toLocaleString('pt-BR')}</p>
                            </div>
                            <span className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-500/30">Aguardando</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Filter active vs history based on updated logic
    const activeAssignments = assignments.filter(a => isAssignmentActive(a));
    const historyAssignments = assignments.filter(a => !isAssignmentActive(a));

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
                {promoter && <button onClick={() => setIsStatsModalOpen(true)} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 text-sm font-semibold">Minhas Estatísticas</button>}
            </div>
            <div className="bg-secondary shadow-2xl rounded-lg p-8 mb-6">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail para ver suas tarefas de divulgação.</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" required />
                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50">{isLoading ? 'Buscando...' : 'Ver Tarefas'}</button>
                </form>
            </div>

            {searched && !isLoading && (
                <div className="space-y-8">
                    {renderScheduledPosts()}
                    
                    {/* Active Assignments */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircleIcon className="w-6 h-6 text-primary" /> Tarefas Pendentes
                        </h2>
                        {activeAssignments.length > 0 ? (
                            activeAssignments.map(assignment => (
                                <PostCard key={assignment.id} assignment={assignment} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} />
                            ))
                        ) : (
                            <p className="text-center text-gray-400 py-4 border border-gray-700 rounded-lg bg-dark/50">Nenhuma tarefa pendente no momento! 🎉</p>
                        )}
                    </div>

                    {/* History Assignments */}
                    {historyAssignments.length > 0 && (
                        <div className="space-y-6 pt-6 border-t border-gray-700">
                            <button 
                                onClick={() => setShowHistory(!showHistory)} 
                                className="w-full flex justify-between items-center text-xl font-bold text-gray-400 hover:text-white transition-colors"
                            >
                                <span>Histórico ({historyAssignments.length})</span>
                                <span className="text-sm bg-gray-700 px-3 py-1 rounded-full">{showHistory ? 'Ocultar' : 'Mostrar'}</span>
                            </button>
                            
                            {showHistory && (
                                <div className="space-y-6 animate-fadeIn">
                                    {historyAssignments.map(assignment => (
                                        <PostCard key={assignment.id} assignment={assignment} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {justificationAssignment && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold text-white mb-4">Justificar Ausência</h3>
                        <p className="text-gray-300 text-sm mb-4">Explique por que você não pôde realizar esta publicação ({justificationAssignment.post.campaignName}).</p>
                        <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Motivo..." rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 mb-4" />
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Anexar Print/Foto (Opcional)</label>
                            <input type="file" onChange={handleJustificationFileChange} multiple accept="image/*" className="text-sm text-gray-400" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setJustificationAssignment(null)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                            <button onClick={handleSubmitJustification} disabled={isSubmittingJustification} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">{isSubmittingJustification ? 'Enviando...' : 'Enviar'}</button>
                        </div>
                    </div>
                </div>
            )}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
