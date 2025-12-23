
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, scheduleProofPushReminder } from '../services/postService';
import { findPromotersByEmail, changePromoterEmail } from '../services/promoterService';
import { testSelfPush } from '../services/messageService';
import { PostAssignment, Promoter, Timestamp } from '../types';
import { 
    ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, 
    ExternalLinkIcon, CheckCircleIcon, WhatsAppIcon, MegaphoneIcon, 
    LogoutIcon, DocumentDuplicateIcon, SearchIcon, ChartBarIcon, 
    XIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon, PencilIcon 
} from '../components/Icons';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import { initPushNotifications, clearPushListeners, PushStatus } from '../services/pushService';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const isHistoryAssignment = (assignment: PostAssignment): boolean => {
    if (assignment.proofSubmittedAt) return true;
    if (assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') return true;
    if (!assignment.post.isActive) return true;
    const now = new Date();
    const expiresAt = toDateSafe(assignment.post.expiresAt);
    if (expiresAt && now > expiresAt) {
        if (assignment.post.allowLateSubmissions) return false;
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if (confirmedAt) {
                const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                if (now < deadline) return false;
            }
        }
        return true;
    }
    return false;
};

const CountdownTimer: React.FC<{ targetDate: any, prefix?: string }> = ({ targetDate, prefix = '' }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);
    useEffect(() => {
        const target = toDateSafe(targetDate);
        if (!target) return;
        const updateTimer = () => {
            const now = new Date();
            const difference = target.getTime() - now.getTime();
            if (difference > 0) {
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                setTimeLeft(`${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`);
                setIsExpired(false);
            } else { setTimeLeft('Encerrado'); setIsExpired(true); }
        };
        updateTimer(); const timer = setInterval(updateTimer, 60000);
        return () => clearInterval(timer);
    }, [targetDate]);
    if (!timeLeft) return null;
    return <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isExpired ? 'bg-red-900/30 text-red-400' : 'bg-primary/20 text-primary'}`}><ClockIcon className="h-3 w-3" /><span>{prefix}{timeLeft}</span></div>;
};

const PostCard: React.FC<{ 
    assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, 
    promoter: Promoter,
    onConfirm: (assignment: PostAssignment) => void, 
    onJustify: (assignment: PostAssignment) => void, 
    onRefresh: () => void 
}> = ({ assignment, promoter, onConfirm, onJustify, onRefresh }) => {
    const navigate = useNavigate();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSchedulingReminder, setIsSchedulingReminder] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [timeLeftForProof, setTimeLeftForProof] = useState('');
    const [isProofButtonEnabled, setIsProofButtonEnabled] = useState(false);
    const [countdownColor, setCountdownColor] = useState('text-gray-400');
    
    useEffect(() => {
        if (assignment.status !== 'confirmed' || !assignment.confirmedAt || assignment.proofSubmittedAt) return;
        
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;

        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        const calculatedEnableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);

        const timer = setInterval(() => {
            const now = new Date();

            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) {
                    setTimeLeftForProof('Envio liberado (fora do prazo)');
                    setIsProofButtonEnabled(true);
                    setCountdownColor('text-yellow-500');
                } else {
                    setTimeLeftForProof('Prazo esgotado');
                    setIsProofButtonEnabled(false);
                    setCountdownColor('text-red-500');
                }
                clearInterval(timer);
                return;
            }

            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                setTimeLeftForProof(`Envio Liberado! Expira em: ${Math.floor(diff/3600000)}h ${Math.floor((diff/60000)%60)}m`);
                setIsProofButtonEnabled(true);
                setCountdownColor('text-green-400');
                return;
            }

            if (now < calculatedEnableTime) {
                const diff = calculatedEnableTime.getTime() - now.getTime();
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff / 60000) % 60);
                const s = Math.floor((diff / 1000) % 60);
                setTimeLeftForProof(`Liberando em: ${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
                setIsProofButtonEnabled(false);
                setCountdownColor('text-orange-400');
            } 
            else {
                const diff = expireTime.getTime() - now.getTime();
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff / 60000) % 60);
                setTimeLeftForProof(`Envio Liberado! Expira em: ${h}h ${m}m`);
                setIsProofButtonEnabled(true);
                setCountdownColor('text-green-400 font-black');
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [assignment.status, assignment.confirmedAt, assignment.post.allowLateSubmissions, assignment.post.allowImmediateProof, assignment.proofSubmittedAt]);

    const handleConfirm = async () => {
        setIsConfirming(true);
        try { 
            await confirmAssignment(assignment.id); 
            await onConfirm(assignment); 
        }
        catch (err: any) { alert(err.message); } finally { setIsConfirming(false); }
    };

    const handleScheduleReminder = async () => {
        if (isSchedulingReminder || assignment.reminderScheduled) return;
        setIsSchedulingReminder(true);
        try {
            await scheduleProofPushReminder(assignment, promoter);
            await onRefresh();
            alert("Lembrete agendado! Você receberá uma notificação em 6 horas.");
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsSchedulingReminder(false);
        }
    };

    const handleDownloadLink1 = async () => {
        if (!assignment.post.mediaUrl) return;
        setIsDownloading(true);
        try {
            const storageRef = storage.ref(assignment.post.mediaUrl);
            const url = await storageRef.getDownloadURL();
            window.open(url, '_blank');
        } catch (e) {
            alert("Erro ao baixar arquivo do Link 1.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleLinkAction = () => {
        if (!assignment.post.postLink) return;
        if (assignment.post.type === 'text') window.open(assignment.post.postLink, '_blank');
        else {
            navigator.clipboard.writeText(assignment.post.postLink);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        }
    };

    if (!assignment.promoterHasJoinedGroup) {
        return (
            <div className="bg-dark/50 p-6 rounded-3xl border-2 border-yellow-900/50 mb-4 animate-fadeIn">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-black text-white uppercase tracking-tight">{assignment.post.campaignName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                      <p className="text-yellow-500 text-xs font-black uppercase tracking-widest">Ação necessária!</p>
                    </div>
                  </div>
                  <button onClick={onRefresh} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
                    <RefreshIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed mb-6">
                  Você precisa entrar no grupo oficial desta produtora (e aceitar os termos de uso) para que as tarefas sejam liberadas automaticamente no seu portal.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="flex-1 flex items-center justify-center gap-2 py-3 bg-yellow-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-yellow-500 transition-colors">ACEITAR REGRAS</Link>
                  <button onClick={onRefresh} className="flex-1 py-3 bg-gray-800 text-gray-300 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-gray-700 transition-colors border border-gray-700">JÁ ACEITEI, ATUALIZAR</button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-secondary rounded-3xl shadow-xl overflow-hidden border border-gray-800 mb-6 animate-fadeIn">
            <div className="p-5 flex justify-between items-start bg-white/5">
                <div>
                    <p className="font-black text-white uppercase tracking-tight">{assignment.post.campaignName}</p>
                    <p className="text-xs text-primary font-bold">{assignment.post.eventName || 'Publicação de Equipe'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {assignment.post.expiresAt && <CountdownTimer targetDate={assignment.post.expiresAt} />}
                    {assignment.proofSubmittedAt || assignment.justificationStatus === 'accepted' ? (
                        <span className="text-[10px] font-bold text-green-400 uppercase bg-green-900/20 px-2 py-0.5 rounded-full">Concluído</span>
                    ) : (assignment.justification && (assignment.justificationStatus === 'pending' || !assignment.justificationStatus)) ? (
                        <span className="text-[10px] font-bold text-yellow-400 uppercase bg-yellow-900/20 px-2 py-0.5 rounded-full">Em análise</span>
                    ) : (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${assignment.status === 'confirmed' ? 'bg-blue-900/20 text-blue-400' : 'bg-yellow-900/20 text-yellow-400'}`}>
                            {assignment.status === 'confirmed' ? 'Aguardando Print' : 'Novo Post'}
                        </span>
                    )}
                </div>
            </div>
            <div className="p-5 space-y-4">
                <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 text-sm text-gray-300 whitespace-pre-wrap italic">{assignment.post.instructions}</div>
                {assignment.post.type !== 'text' && (
                    <div className="space-y-3">
                        <div className="rounded-2xl overflow-hidden border border-gray-700">
                             <StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type as any} className="w-full h-auto max-h-64 object-contain bg-black" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {assignment.post.mediaUrl && (
                                <button onClick={handleDownloadLink1} disabled={isDownloading} className="flex items-center justify-center gap-2 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-xs font-bold transition-all"><DownloadIcon className="w-4 h-4" /> LINK 1</button>
                            )}
                            {assignment.post.googleDriveUrl && (
                                <a href={assignment.post.googleDriveUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 bg-blue-900/40 border border-blue-800 text-blue-300 hover:bg-blue-900/60 rounded-xl text-xs font-bold transition-all"><DownloadIcon className="w-4 h-4" /> LINK 2</a>
                            )}
                        </div>
                    </div>
                )}
                {assignment.post.postLink && (
                    <button onClick={handleLinkAction} className={`w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl text-xs font-black transition-all ${linkCopied ? 'border-green-500 text-green-400 bg-green-900/10' : 'border-primary/50 text-primary hover:bg-primary/5'}`}>
                        {assignment.post.type === 'text' ? <ExternalLinkIcon className="w-4 h-4" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                        {assignment.post.type === 'text' ? 'ABRIR LINK' : (linkCopied ? 'COPIADO!' : 'COPIAR LINK')}
                    </button>
                )}
            </div>
            <div className="px-5 pb-5">
                {!assignment.proofSubmittedAt && !assignment.justification && (
                    <div className="flex flex-col gap-4">
                         {assignment.status === 'pending' ? (
                            <button onClick={handleConfirm} disabled={isConfirming} className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all text-lg">{isConfirming ? 'GRAVANDO...' : 'EU POSTEI! 🚀'}</button>
                        ) : (
                            <div className="space-y-3">
                                <button 
                                    onClick={() => navigate(`/proof/${assignment.id}`)} 
                                    disabled={!isProofButtonEnabled} 
                                    className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/20 disabled:opacity-30 text-lg transition-all"
                                >
                                    {isProofButtonEnabled ? 'ENVIAR PRINT' : 'AGUARDE O TEMPO ABAIXO'}
                                </button>
                                
                                {/* BOTÃO DE LEMBRETE 6H */}
                                {!isProofButtonEnabled && promoter.fcmToken && (
                                    <button 
                                        onClick={handleScheduleReminder} 
                                        disabled={isSchedulingReminder || assignment.reminderScheduled}
                                        className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest transition-all ${assignment.reminderScheduled ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-400' : 'bg-dark/40 border-white/10 text-gray-400 hover:bg-indigo-900/10 hover:border-indigo-500/30'}`}
                                    >
                                        <FaceIdIcon className="w-4 h-4" />
                                        {assignment.reminderScheduled ? 'Lembrete Push Ativado (6h)' : 'Me avisar via Push em 6h'}
                                    </button>
                                )}

                                <div className="flex items-center justify-center gap-2 py-2 bg-dark/30 rounded-xl border border-white/5">
                                    <ClockIcon className={`w-4 h-4 ${countdownColor}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${countdownColor}`}>
                                        {timeLeftForProof}
                                    </span>
                                </div>
                            </div>
                        )}
                        <button onClick={() => onJustify(assignment)} className="w-full py-2 bg-red-900/10 text-red-400 border border-red-900/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-900/20 transition-colors">JUSTIFICAR AUSÊNCIA</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const PostCheck: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[]>([]);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    
    const [isChangingEmail, setIsChangingEmail] = useState(false);
    const [newEmailValue, setNewEmailValue] = useState('');
    const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

    const pushInitializedFor = useRef<string | null>(null);
    const [pushStatus, setPushStatus] = useState<PushStatus>('idle');
    const [pushErrorDetail, setPushErrorDetail] = useState<string | null>(null);
    const [pushTestCountdown, setPushTestCountdown] = useState<number | null>(null);

    const [justificationAssignment, setJustificationAssignment] = useState<PostAssignment | null>(null);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [justificationPreviews, setJustificationPreviews] = useState<string[]>([]);
    const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);

    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

    // Gerenciador da contagem regressiva de 10s para o Teste de Push
    useEffect(() => {
        let interval: any;
        if (pushTestCountdown !== null && pushTestCountdown > 0) {
            interval = setInterval(() => {
                setPushTestCountdown(prev => (prev !== null ? prev - 1 : null));
            }, 1000);
        } else if (pushTestCountdown === 0) {
            if (promoter?.fcmToken) {
                testSelfPush(promoter.fcmToken, promoter.name).catch(e => {
                    alert("Erro no disparo: " + e.message);
                });
            }
            setPushTestCountdown(null);
        }
        return () => clearInterval(interval);
    }, [pushTestCountdown, promoter]);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setSearched(true);
        try {
            const profiles = await findPromotersByEmail(searchEmail);
            if (profiles.length === 0) { 
              alert("E-mail não encontrado."); setSearched(false); setIsLoading(false); return; 
            }
            
            const producerRuleAccepted = new Map<string, boolean>();
            profiles.forEach(p => {
                if (p.hasJoinedGroup === true) {
                    producerRuleAccepted.set(p.organizationId, true);
                }
            });

            const sortedProfiles = [...profiles].sort((a, b) => {
              if (a.status === 'approved' && b.status !== 'approved') return -1;
              if (a.status !== 'approved' && b.status === 'approved') return 1;
              const timeA = (a.createdAt as any)?.seconds || 0;
              const timeB = (b.createdAt as any)?.seconds || 0;
              return timeB - timeA;
            });
            
            setPromoter(sortedProfiles[0]);
            localStorage.setItem('saved_promoter_email', searchEmail.toLowerCase().trim());
            
            const fetchedAssignments = await getAssignmentsForPromoterByEmail(searchEmail);
            const mappedAssignments = fetchedAssignments.map(a => ({
                ...a,
                promoterHasJoinedGroup: producerRuleAccepted.get(a.organizationId) || false
            }));
            setAssignments(mappedAssignments);
        } catch (err: any) { alert("Erro ao carregar dados."); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        const savedEmail = localStorage.getItem('saved_promoter_email');
        if (emailFromQuery) { setEmail(emailFromQuery); performSearch(emailFromQuery); }
        else if (savedEmail) { setEmail(savedEmail); performSearch(savedEmail); }
    }, [location.search, performSearch]);

    useEffect(() => {
        if (promoter?.id && pushInitializedFor.current !== promoter.id) {
            pushInitializedFor.current = promoter.id;
            initPushNotifications(promoter.id, (status, detail) => {
                setPushStatus(status);
                if (detail) setPushErrorDetail(detail);
            });
        }
    }, [promoter?.id]);

    const handleLogout = () => {
        localStorage.removeItem('saved_promoter_email');
        setPromoter(null); setSearched(false); setEmail(''); setAssignments([]);
        pushInitializedFor.current = null; setPushStatus('idle');
    };

    const handleEmailChangeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newEmailValue.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@')) return;
        setIsUpdatingEmail(true);
        try {
            await changePromoterEmail(promoter!.id, promoter!.email, trimmed);
            setEmail(trimmed);
            localStorage.setItem('saved_promoter_email', trimmed);
            setIsChangingEmail(false);
            performSearch(trimmed);
        } catch (err: any) { alert(err.message); } finally { setIsUpdatingEmail(false); }
    };

    const handleTestPushClick = () => {
        if (!promoter?.fcmToken || pushTestCountdown !== null) return;
        setPushTestCountdown(10);
    };

    const handleJustificationSubmit = async () => {
        if (!justificationAssignment || !justificationText.trim()) return;
        setIsSubmittingJustification(true);
        try {
            await submitJustification(justificationAssignment.id, justificationText, justificationFiles);
            setJustificationAssignment(null); setJustificationText(''); setJustificationFiles([]);
            performSearch(email);
        } catch (err: any) { alert(err.message); } finally { setIsSubmittingJustification(false); }
    };

    const pending = assignments.filter(a => !isHistoryAssignment(a));
    const history = assignments.filter(a => isHistoryAssignment(a));

    if (!searched || !promoter) {
        return (
            <div className="max-w-md mx-auto py-10 px-4">
                <div className="bg-secondary shadow-2xl rounded-3xl p-8 border border-gray-800 text-center">
                    <MegaphoneIcon className="w-16 h-16 text-primary mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Minhas Tarefas</h1>
                    <p className="text-gray-400 text-sm mb-8">Acesse suas postagens e materiais exclusivos.</p>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="exemplo@gmail.com" className="w-full px-4 py-4 border border-gray-700 rounded-2xl bg-gray-800 text-white outline-none focus:ring-2 focus:ring-primary font-bold" required />
                        <button type="submit" disabled={isLoading} className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20">{isLoading ? 'BUSCANDO...' : 'ACESSAR AGORA'}</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto pb-20">
            <div className="flex justify-between items-start mb-8 px-2">
                <div className="flex-grow overflow-hidden">
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight truncate">Olá, {promoter.name.split(' ')[0]}!</h1>
                    
                    {isChangingEmail ? (
                        <form onSubmit={handleEmailChangeSubmit} className="flex items-center gap-2 mt-1">
                            <input type="email" value={newEmailValue} onChange={e => setNewEmailValue(e.target.value)} className="bg-gray-800 border border-gray-700 text-[10px] text-white px-2 py-1 rounded-lg outline-none flex-grow" autoFocus />
                            <button type="submit" className="text-green-400 font-bold text-[10px] uppercase">OK</button>
                            <button type="button" onClick={() => setIsChangingEmail(false)} className="text-gray-500 font-bold text-[10px] uppercase">Sair</button>
                        </form>
                    ) : (
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{promoter.email}</p>
                            <button onClick={() => { setIsChangingEmail(true); setNewEmailValue(promoter.email); }} className="text-gray-600 hover:text-primary transition-colors"><PencilIcon className="w-3.5 h-3.5" /></button>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <button onClick={() => setIsStatsModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"><ChartBarIcon className="w-3 h-3" /> MEU STATUS</button>
                        
                        {/* BOTÃO TESTAR PUSH */}
                        {promoter.fcmToken && (
                            <button 
                                onClick={handleTestPushClick}
                                disabled={pushTestCountdown !== null}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-900/20 text-indigo-400 border border-indigo-900/30 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${pushTestCountdown !== null ? 'animate-pulse scale-105' : 'hover:bg-indigo-900/40 hover:scale-105'}`}
                            >
                                <FaceIdIcon className="w-3 h-3" />
                                {pushTestCountdown !== null ? `RECEBER EM ${pushTestCountdown}S...` : 'TESTAR PUSH'}
                            </button>
                        )}

                        {pushStatus === 'success' && <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-900/20 text-green-400 border border-green-900/30 rounded-full text-[10px] font-black uppercase tracking-widest"><CheckCircleIcon className="w-3 h-3"/> APP CONECTADO</span>}
                    </div>
                </div>
                <button onClick={handleLogout} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-red-400 transition-colors ml-4 flex-shrink-0"><LogoutIcon className="w-6 h-6" /></button>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-gray-700/50">
                <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'pending' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Ativas ({pending.length})</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'history' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Finalizadas ({history.length})</button>
            </div>

            <div className="space-y-2">
                {isLoading ? <div className="text-center py-20 animate-pulse text-primary font-black uppercase">Sincronizando tarefas...</div> : (
                    activeTab === 'pending' ? (
                        pending.length > 0 ? pending.map(a => <PostCard key={a.id} assignment={a} promoter={promoter} onConfirm={() => performSearch(email)} onJustify={setJustificationAssignment} onRefresh={() => performSearch(email)} />) 
                        : <div className="text-center py-20"><div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircleIcon className="w-8 h-8 text-green-500" /></div><p className="text-gray-400 font-bold">Tudo em dia! 🎉</p></div>
                    ) : (
                        history.length > 0 ? history.map(a => <PostCard key={a.id} assignment={a} promoter={promoter} onConfirm={()=>{}} onJustify={()=>{}} onRefresh={()=>{}} />) 
                        : <p className="text-center text-gray-500 py-10 font-bold uppercase tracking-widest text-[10px]">Histórico Vazio</p>
                    )
                )}
            </div>

            {justificationAssignment && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setJustificationAssignment(null)}>
                    <div className="bg-secondary w-full max-w-md p-8 rounded-3xl border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Justificar</h3>
                        <p className="text-gray-400 text-sm mb-6 leading-relaxed">Por que você não poderá realizar esta postagem?</p>
                        <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Descreva aqui..." rows={4} className="w-full p-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary mb-6" />
                        <div className="flex gap-4">
                           <button onClick={() => setJustificationAssignment(null)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-2xl">CANCELAR</button>
                           <button onClick={handleJustificationSubmit} disabled={isSubmittingJustification || !justificationText.trim()} className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl disabled:opacity-30 uppercase text-xs tracking-widest">{isSubmittingJustification ? 'ENVIANDO...' : 'ENVIAR'}</button>
                        </div>
                    </div>
                </div>
            )}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
