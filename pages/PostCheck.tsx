
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter, updateAssignment } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon, CalendarIcon, WhatsAppIcon } from '../components/Icons';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';

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

const formatDateForICS = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
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

        // If confirmed, check the 6h window from confirmation time (as per new rule)
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if (confirmedAt) {
                const deadline = new Date(confirmedAt.getTime() + 6 * 60 * 60 * 1000);
                if (now < deadline) return true; // Still in window
            }
        }
        
        // Otherwise expired/missed -> History
        return false;
    }

    return true;
};

const CountdownTimer: React.FC<{ targetDate: Date | null, onEnd?: () => void }> = ({ targetDate, onEnd }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!targetDate) return;

        const updateTimer = () => {
            const now = new Date();
            const difference = targetDate.getTime() - now.getTime();
            if (difference > 0) {
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            } else {
                setTimeLeft('Encerrado');
                if (onEnd) onEnd();
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [targetDate, onEnd]);

    if (!timeLeft) return null;

    return <span>{timeLeft}</span>;
};


const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void }> = ({ assignment, onConfirm, onJustify }) => {
    const navigate = useNavigate();
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
    
     const handleAddToCalendar = () => {
        const title = `Lembrete: Enviar Print - ${assignment.post.campaignName}`;
        const proofLink = `${window.location.origin}/#/proof/${assignment.id}`;
        const description = `Não se esqueça de enviar o print da sua publicação!\\n\\nAcesse o link para enviar: ${proofLink}`;
        
        const reminderDate = new Date();
        reminderDate.setHours(reminderDate.getHours() + 6);
        const endDate = new Date(reminderDate.getTime() + 30 * 60 * 1000); // 30 min duration

        const nowICS = formatDateForICS(new Date());
        const start = formatDateForICS(reminderDate);
        const end = formatDateForICS(endDate);

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Equipe Certa//Lembrete v1.0//EN',
            'BEGIN:VEVENT',
            `UID:${nowICS}-${Math.random().toString(36).substring(2)}@equipecerta.com`,
            `DTSTAMP:${nowICS}`,
            `DTSTART:${start}`,
            `DTEND:${end}`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${description}`,
            `URL:${proofLink}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', `lembrete_${assignment.post.campaignName.replace(/\s+/g, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleWhatsAppReminder = () => {
        const promoterName = assignment.promoterName.split(' ')[0];
        const campaignName = assignment.post.campaignName;
        const proofLink = `${window.location.origin}/#/proof/${assignment.id}`;
        const text = encodeURIComponent(`⏰ Lembrete: Enviar o print do evento *${campaignName}*! Acesse aqui para enviar: ${proofLink}`);
        const url = `https://wa.me/?text=${text}`; // Sends to user's own number or prompts them
        window.open(url, '_blank');
    };

    const renderJustificationStatus = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => { 
        const styles = { pending: "bg-yellow-900/50 text-yellow-300", accepted: "bg-green-900/50 text-green-300", rejected: "bg-red-900/50 text-red-300" }; 
        const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" }; 
        const effectiveStatus = status || 'pending';
// FIX: Changed from function call `styles(effectiveStatus)` to bracket notation `styles[effectiveStatus]` for object property access.
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[effectiveStatus]}`}>{text[effectiveStatus]}</span>; 
    };
    
    const hasProof = !!assignment.proofSubmittedAt;
    const hasJustification = !!assignment.justification;
    const isWaitingForProof = assignment.status === 'confirmed' && !hasProof && !hasJustification;
    const proofDeadline = isWaitingForProof && assignment.confirmedAt ? new Date((assignment.confirmedAt as Timestamp).toDate().getTime() + 6 * 60 * 60 * 1000) : null;

    const renderActions = () => {
        if (hasProof) return (
            <div className="mt-4 text-center">
                <p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>
                {assignment.proofImageUrls && assignment.proofImageUrls.length > 0 ? (
                    <div className="flex justify-center gap-2">
                        {assignment.proofImageUrls.map((url, index) => (
                            <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" />
                            </a>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">(Concluído automaticamente)</p>
                )}
            </div>
        );
        
        if (hasJustification) {
             return (
                <div className="mt-4 text-center">
                    <p className="text-sm text-yellow-300 font-semibold mb-2">Justificativa Enviada</p>
                    <p className="text-sm italic text-gray-300 bg-gray-800 p-2 rounded-md mb-2">"{assignment.justification}"</p>
                    <div className="text-xs mb-2">Status: {renderJustificationStatus(assignment.justificationStatus)}</div>
                    {assignment.justificationResponse && (
                        <div className="mt-2 text-left bg-dark p-3 rounded-md border-l-4 border-primary">
                            <p className="text-sm font-semibold text-primary mb-1">Resposta do Organizador:</p>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap">{assignment.justificationResponse}</p>
                        </div>
                    )}
                </div>
            );
        }

        if (assignment.status === 'pending') {
            if (!assignment.post.isActive || isExpired) {
                return (
                    <div className="w-full flex flex-col sm:flex-row gap-2 mt-4">
                        {allowJustification ? (
                            <button onClick={() => onJustify(assignment)} className="w-full px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">
                                Justificar Ausência
                            </button>
                        ) : (
                            <button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">
                                Justificar Ausência
                            </button>
                        )}
                    </div>
                );
            }
            return (
                <div className="w-full flex flex-col sm:flex-row gap-2 mt-4">
                    {allowJustification && (
                         <button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 transition-colors text-sm">
                            Não vou postar
                        </button>
                    )}
                    <button onClick={handleConfirm} disabled={isConfirming} className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors text-lg shadow-md">
                        {isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}
                    </button>
                </div>
            );
        }

        if (isWaitingForProof) {
            return (
                <div className="mt-4 space-y-4">
                    <div className="text-center p-3 bg-blue-900/50 rounded-lg border border-blue-500/50">
                        <p className="font-bold text-white">Envie a comprovação no prazo!</p>
                        {proofDeadline && (
                            <div className="text-sm text-blue-300">
                                <span className="block">Prazo final: {proofDeadline.toLocaleString('pt-BR')}</span>
                                <span className="font-mono text-xs">(<CountdownTimer targetDate={proofDeadline} /> restantes)</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <button onClick={() => navigate(`/proof/${assignment.id}`)} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors text-lg">
                            <CameraIcon className="w-6 h-6" /> Enviar Print
                        </button>
                        {allowJustification && (
                            <button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 transition-colors text-sm">
                                Justificar
                            </button>
                        )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-700/50 text-center">
                        <p className="text-xs text-gray-400 mb-2">Precisa de um lembrete?</p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                            <button onClick={handleAddToCalendar} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 text-sm">
                                <CalendarIcon className="w-4 h-4" /> Lembrete no Celular
                            </button>
                            <button onClick={handleWhatsAppReminder} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
                                <WhatsAppIcon className="w-4 h-4" /> Lembrete no WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return <p className="text-xs text-gray-500 text-center mt-4">Status da tarefa desconhecido.</p>;
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
            <h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>
            {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
            
            <div className="mt-4 border-t border-gray-700/50 pt-4">
                <h4 className="font-semibold text-gray-200 mb-2">Instruções:</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap mb-4">{assignment.post.instructions}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    {assignment.post.mediaUrl && <button onClick={handleFirebaseDownload} disabled={isMediaProcessing || !isPostDownloadable} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold disabled:opacity-50 hover:bg-gray-500"><DownloadIcon className="w-4 h-4" /> Download Mídia 1</button>}
                    {assignment.post.googleDriveUrl && <button onClick={handleGoogleDriveDownload} disabled={!isPostDownloadable} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-500"><DownloadIcon className="w-4 h-4" /> Download Mídia 2</button>}
                    {assignment.post.postLink && <a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md text-sm font-semibold hover:bg-gray-600"><ExternalLinkIcon className="w-4 h-4" /> Ver Post Original</a>}
                </div>
            </div>

            <div className="mt-4 border-t border-gray-700/50 pt-4">
                {renderActions()}
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
    const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    // Stats Modal
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

    // Justification Modal
    const [justifyingAssignment, setJustifyingAssignment] = useState<PostAssignment | null>(null);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [isJustifying, setIsJustifying] = useState(false);


    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setPromoter(null);
        setAssignments([]);
        setScheduled([]);
        setSearched(true);
        try {
            const profiles = await findPromotersByEmail(searchEmail);
            const approvedProfile = profiles.find(p => p.status === 'approved');
            
            if (!approvedProfile) {
                 setError("Nenhum cadastro de divulgadora APROVADO foi encontrado para este e-mail. Verifique o status do seu cadastro.");
                 return;
            }
            
            setPromoter(approvedProfile);

            const [assignmentData, scheduledData] = await Promise.all([
                getAssignmentsForPromoterByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail),
            ]);
            setAssignments(assignmentData);
            setScheduled(scheduledData);

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
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
        performSearch(email);
    };

    const handleConfirm = async (assignment: PostAssignment) => {
        try {
            await confirmAssignment(assignment.id);
            setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, status: 'confirmed', confirmedAt: new Date() as any } : a));
        } catch (err: any) {
            setError(err.message || 'Falha ao confirmar.');
        }
    };
    
    const handleOpenJustify = (assignment: PostAssignment) => {
        setJustifyingAssignment(assignment);
        setJustificationText('');
        setJustificationFiles([]);
    };
    
    const handleCloseJustify = () => {
        setJustifyingAssignment(null);
    };

    const handleJustificationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!justifyingAssignment || !justificationText.trim()) {
            setError("Por favor, escreva o motivo da sua ausência.");
            return;
        }
        setIsJustifying(true);
        setError(null);
        try {
            await submitJustification(justifyingAssignment.id, justificationText, justificationFiles);
            await performSearch(email);
            handleCloseJustify();
        } catch (err: any) {
            setError(err.message || "Falha ao enviar justificativa.");
        } finally {
            setIsJustifying(false);
        }
    };


    const { activeAssignments, historyAssignments } = useMemo(() => {
        const active: PostAssignment[] = [];
        const history: PostAssignment[] = [];
        assignments.forEach(a => {
            if (isAssignmentActive(a)) {
                active.push(a);
            } else {
                history.push(a);
            }
        });
        return { activeAssignments: active, historyAssignments: history };
    }, [assignments]);
    

    const renderResult = () => {
        if (!searched) return null;
        if (isLoading) return <div className="flex justify-center items-center h-24"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>;
        if (error && !promoter) return <p className="text-red-400 mt-4 text-center">{error}</p>;
        if (!promoter) return null;

        const promoterHasJoined = (campaignName: string) => {
             const profileForCampaign = promoter.allCampaigns?.includes(campaignName) ? promoter : null;
             return profileForCampaign?.hasJoinedGroup ?? true;
        };

        return (
            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white text-center">Olá, {promoter.name.split(' ')[0]}!</h2>
                 <div className="text-center">
                    <button onClick={() => setIsStatsModalOpen(true)} className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700">Ver Minhas Estatísticas</button>
                </div>

                {activeAssignments.length > 0 && (
                    <section>
                        <h3 className="text-xl font-semibold text-gray-200 mb-4 border-b-2 border-primary pb-2">Publicações Ativas</h3>
                        <div className="space-y-4">
                            {activeAssignments.map(a => <PostCard key={a.id} assignment={{...a, promoterHasJoinedGroup: promoterHasJoined(a.post.campaignName)}} onConfirm={handleConfirm} onJustify={handleOpenJustify} />)}
                        </div>
                    </section>
                )}
                
                {scheduled.length > 0 && (
                     <section>
                        <h3 className="text-xl font-semibold text-gray-200 mb-4 border-b-2 border-yellow-500 pb-2">Publicações Agendadas</h3>
                        <div className="space-y-4">
                            {scheduled.map(s => (
                                <div key={s.id} className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500 opacity-80">
                                    <h4 className="font-bold text-lg text-primary">{s.postData.campaignName}</h4>
                                    {s.postData.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{s.postData.eventName}</p>}
                                    <p className="text-sm text-yellow-300 font-semibold mt-2">
                                        <CountdownTimer targetDate={(s.scheduledAt as Timestamp).toDate()} />
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {historyAssignments.length > 0 && (
                    <section>
                        <h3 className="text-xl font-semibold text-gray-200 mb-4 border-b-2 border-gray-600 pb-2">Histórico de Publicações</h3>
                        <div className="space-y-4">
                             {historyAssignments.map(a => <PostCard key={a.id} assignment={{...a, promoterHasJoinedGroup: true}} onConfirm={() => {}} onJustify={() => {}} />)}
                        </div>
                    </section>
                )}

                {activeAssignments.length === 0 && historyAssignments.length === 0 && scheduled.length === 0 && (
                    <p className="text-center text-gray-400 py-8">Nenhuma publicação encontrada para você no momento.</p>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Confirme, envie prints e justifique suas tarefas.</p>
                {!promoter && (<form onSubmit={handleSubmit} className="space-y-4"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required /><button type="submit" disabled={isLoading} className="w-full py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">{isLoading ? 'Buscando...' : 'Buscar Minhas Tarefas'}</button></form>)}
                <div className="mt-8">{renderResult()}</div>
            </div>
             <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
             {justifyingAssignment && (
                 <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={handleCloseJustify}>
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold text-white mb-4">Justificar Ausência</h2>
                        <p className="text-sm text-gray-400 mb-4">Explique o motivo pelo qual você não poderá realizar a postagem para o evento <strong className="text-primary">{justifyingAssignment.post.campaignName}</strong>.</p>
                        <form onSubmit={handleJustificationSubmit} className="space-y-4">
                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Escreva sua justificativa aqui..." rows={5} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" required/>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Anexar Comprovação (opcional)</label>
                                <input type="file" accept="image/*" multiple onChange={e => setJustificationFiles(Array.from(e.target.files || []))} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
                            </div>
                            <div className="flex justify-end gap-3"><button type="button" onClick={handleCloseJustify} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button><button type="submit" disabled={isJustifying} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">{isJustifying ? 'Enviando...' : 'Enviar Justificativa'}</button></div>
                        </form>
                    </div>
                 </div>
             )}
        </div>
    );
};

export default PostCheck;
