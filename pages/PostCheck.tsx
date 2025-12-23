
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification } from '../services/postService';
import { findPromotersByEmail, changePromoterEmail } from '../services/promoterService';
import { PostAssignment, Promoter, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon, WhatsAppIcon, MegaphoneIcon, LogoutIcon, DocumentDuplicateIcon, SearchIcon, ChartBarIcon, XIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon, PencilIcon } from '../components/Icons';
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

const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void, onRefresh: () => void }> = ({ assignment, onConfirm, onJustify, onRefresh }) => {
    const navigate = useNavigate();
    const [isConfirming, setIsConfirming] = useState(false);
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

        const formatDiff = (diff: number) => {
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff / (1000 * 60)) % 60);
            const s = Math.floor((diff / 1000) % 60);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

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
                setTimeLeftForProof(`Envio Liberado! Expira em: ${formatDiff(diff)}`);
                setIsProofButtonEnabled(true);
                setCountdownColor('text-green-400');
                return;
            }

            if (now < calculatedEnableTime) {
                const diff = calculatedEnableTime.getTime() - now.getTime();
                setTimeLeftForProof(`Liberando em: ${formatDiff(diff)}`);
                setIsProofButtonEnabled(false);
                setCountdownColor('text-orange-400');
            } 
            else {
                const diff = expireTime.getTime() - now.getTime();
                setTimeLeftForProof(`Envio Liberado! Expira em: ${formatDiff(diff)}`);
                setIsProofButtonEnabled(true);
                setCountdownColor('text-green-400 font-black');
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [assignment.status, assignment.confirmedAt, assignment.post.allowLateSubmissions, assignment.post.allowImmediateProof, assignment.proofSubmittedAt]);

    const handleConfirm = async () => {
        setIsConfirming(true);
        try { await confirmAssignment(assignment.id); await onConfirm(assignment); }
        catch (err: any) { alert(err.message); } finally { setIsConfirming(false); }
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
                  <button onClick={onRefresh} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors" title="Atualizar Status">
                    <RefreshIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed mb-6">
                  Você precisa entrar no grupo oficial desta produtora para que as tarefas sejam liberadas automaticamente no seu portal.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="flex-1 flex items-center justify-center gap-2 py-3 bg-yellow-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-yellow-500 transition-colors">PEGAR LINK DO GRUPO</Link>
                  <button onClick={onRefresh} className="flex-1 py-3 bg-gray-800 text-gray-300 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-gray-700 transition-colors border border-gray-700">JÁ ENTREI, ATUALIZAR</button>
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
                        <span className="text-[10px] font-bold text-yellow-400 uppercase bg-yellow-900/20 px-2 py-0.5 rounded-full">Aguardando Aceite de Justificativa</span>
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
                        {assignment.post.type === 'text' ? 'ABRIR LINK DE INTERAÇÃO' : (linkCopied ? 'LINK COPIADO!' : 'COPIAR LINK DE POSTAGEM')}
                    </button>
                )}
            </div>
            <div className="px-5 pb-5">
                {!assignment.proofSubmittedAt && !assignment.justification && (
                    <div className="flex flex-col gap-4">
                         {assignment.status === 'pending' ? (
                            <button onClick={handleConfirm} disabled={isConfirming} className="w-full py-4 bg-green-600 text-white font-black rounded-2xl shadow-lg shadow-green-900/20 hover:scale-[1.01] active:scale-95 transition-all text-lg">{isConfirming ? 'GRAVANDO...' : 'EU POSTEI! 🚀'}</button>
                        ) : (
                            <div className="space-y-2">
                                <button 
                                    onClick={() => navigate(`/proof/${assignment.id}`)} 
                                    disabled={!isProofButtonEnabled} 
                                    className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/20 disabled:opacity-30 text-lg transition-all"
                                >
                                    {isProofButtonEnabled ? 'ENVIAR COMPROVANTE' : 'AGUARDE O TEMPO ABAIXO'}
                                </button>
                                <div className="flex items-center justify-center gap-2 py-2 bg-dark/30 rounded-xl border border-white/5">
                                    <ClockIcon className={`w-4 h-4 ${countdownColor}`} />
                                    <span className={`text-xs font-black uppercase tracking-widest ${countdownColor}`}>
                                        {timeLeftForProof}
                                    </span>
                                </div>
                            </div>
                        )}
                        <button onClick={() => onJustify(assignment)} className="w-full py-2 bg-red-900/10 text-red-400 border border-red-900/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-900/20 transition-colors">ENVIAR UMA JUSTIFICATIVA</button>
                    </div>
                )}
                {assignment.justification && !assignment.justificationStatus && (
                    <div className="bg-yellow-900/20 p-4 rounded-2xl text-center border border-yellow-900/30"><p className="text-yellow-500 text-xs font-bold uppercase">Justificativa em análise</p></div>
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
    const [showFixGuide, setShowFixGuide] = useState(false);

    const [justificationAssignment, setJustificationAssignment] = useState<PostAssignment | null>(null);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [justificationPreviews, setJustificationPreviews] = useState<string[]>([]);
    const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);

    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setSearched(true);
        try {
            const profiles = await findPromotersByEmail(searchEmail);
            if (profiles.length === 0) { 
              alert("E-mail não encontrado. Verifique se digitou corretamente."); 
              setSearched(false); setIsLoading(false); return; 
            }
            const sortedProfiles = [...profiles].sort((a, b) => {
              if (a.status === 'approved' && b.status !== 'approved') return -1;
              if (a.status !== 'approved' && b.status === 'approved') return 1;
              const timeA = (a.createdAt as any)?.seconds || 0;
              const timeB = (b.createdAt as any)?.seconds || 0;
              return timeB - timeA;
            });
            const mainProfile = sortedProfiles[0];
            setPromoter(mainProfile);
            localStorage.setItem('saved_promoter_email', searchEmail.toLowerCase().trim());
            const profileByOrg = new Map<string, Promoter>();
            sortedProfiles.forEach(p => { if (!profileByOrg.has(p.organizationId) || p.status === 'approved') profileByOrg.set(p.organizationId, p); });
            const fetchedAssignments = await getAssignmentsForPromoterByEmail(searchEmail);
            const mappedAssignments = fetchedAssignments.map(a => {
              const orgProfile = profileByOrg.get(a.organizationId);
              return { ...a, promoterHasJoinedGroup: orgProfile ? (orgProfile.hasJoinedGroup || false) : false };
            });
            setAssignments(mappedAssignments);
        } catch (err: any) { alert("Erro ao carregar dados: " + err.message); } finally { setIsLoading(false); }
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
            const timer = setTimeout(() => {
                initPushNotifications(promoter.id, (status, detail) => {
                    setPushStatus(status);
                    if (detail) { setPushErrorDetail(detail); }
                }).catch(err => { setPushStatus('error'); setPushErrorDetail(err.message); });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [promoter?.id]);

    const handleLogout = () => {
        localStorage.removeItem('saved_promoter_email');
        setPromoter(null); setSearched(false); setEmail(''); setAssignments([]);
        pushInitializedFor.current = null; setPushStatus('idle'); setPushErrorDetail(null);
        clearPushListeners();
    };

    const handleEmailChangeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedNewEmail = newEmailValue.trim().toLowerCase();
        if (!trimmedNewEmail || !trimmedNewEmail.includes('@')) {
            alert("Por favor, insira um e-mail válido."); return;
        }
        if (trimmedNewEmail === promoter?.email) {
            setIsChangingEmail(false); return;
        }
        if (!window.confirm("Isso alterará seu login para o novo e-mail. Seu histórico e tarefas serão mantidos. Deseja continuar?")) {
            return;
        }

        setIsUpdatingEmail(true);
        try {
            await changePromoterEmail(promoter!.id, promoter!.email, trimmedNewEmail);
            setEmail(trimmedNewEmail);
            localStorage.setItem('saved_promoter_email', trimmedNewEmail);
            alert("E-mail atualizado com sucesso!");
            setIsChangingEmail(false);
            performSearch(trimmedNewEmail);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsUpdatingEmail(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileList = Array.from(files).slice(0, 2);
            setJustificationFiles(fileList);
            const previewUrls = fileList.map(file => URL.createObjectURL(file as Blob));
            setJustificationPreviews(previewUrls);
        }
    };

    const removePreview = (i: number) => {
        const newFiles = [...justificationFiles]; newFiles.splice(i, 1); setJustificationFiles(newFiles);
        const newPreviews = [...justificationPreviews]; newPreviews.splice(i, 1); setJustificationPreviews(newPreviews);
    };

    const handleJustificationSubmit = async () => {
        if (!justificationAssignment) return;
        if (!justificationText.trim()) return alert("Por favor, escreva o motivo.");
        setIsSubmittingJustification(true);
        try {
            await submitJustification(justificationAssignment.id, justificationText, justificationFiles);
            setJustificationAssignment(null); setJustificationText(''); setJustificationFiles([]); setJustificationPreviews([]);
            performSearch(email);
        } catch (err: any) { alert(err.message); } finally { setIsSubmittingJustification(false); }
    };

    const pending = assignments.filter(a => !isHistoryAssignment(a));
    const history = assignments.filter(a => isHistoryAssignment(a));

    const renderPushStatus = () => {
        if (pushStatus === 'idle') return null;
        const styles = { requesting: 'text-yellow-400 bg-yellow-900/20 border-yellow-800', granted: 'text-blue-400 bg-blue-900/20 border-blue-800', denied: 'text-gray-400 bg-gray-800 border-gray-700', syncing: 'text-yellow-400 bg-yellow-900/20 border-yellow-800 animate-pulse', success: 'text-green-400 bg-green-900/20 border-green-800', error: 'text-red-400 bg-red-900/20 border-red-800' };
        const labels = { requesting: 'Iniciando Notificações...', granted: 'Aguardando Permissão...', denied: 'Permissão de Alerta Negada', syncing: 'Vinculando Aparelho...', success: 'Alertas Push Ativados!', error: 'Erro no Alerta Push' };
        const icons = { requesting: <RefreshIcon className="w-3 h-3 animate-spin" />, granted: <RefreshIcon className="w-3 h-3 animate-spin" />, denied: <XIcon className="w-3 h-3" />, syncing: <RefreshIcon className="w-3 h-3 animate-spin" />, success: <CheckCircleIcon className="w-3 h-3" />, error: <AlertTriangleIcon className="w-3 h-3" /> };
        const currentStyle = styles[pushStatus as keyof typeof styles] || styles.error;
        return (
            <div className="flex flex-col gap-1 items-start mt-2">
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${currentStyle}`}>{icons[pushStatus as keyof typeof icons]}<span>{labels[pushStatus as keyof typeof labels]}</span></div>
                {pushStatus === 'error' && pushErrorDetail && (
                    <div className="bg-red-900/30 border border-red-900/50 p-3 rounded-xl max-w-[280px] shadow-lg animate-fadeIn">
                        <p className="text-[10px] font-bold text-red-200 mb-1 flex items-center gap-1"><AlertTriangleIcon className="w-3 h-3" /> DIAGNÓSTICO TÉCNICO:</p>
                        <p className="text-[9px] font-mono text-red-300 break-words italic leading-relaxed mb-2">{pushErrorDetail}</p>
                        <button onClick={() => setShowFixGuide(true)} className="w-full py-1.5 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-500 uppercase tracking-tighter">Ver Como Corrigir (XCODE)</button>
                    </div>
                )}
            </div>
        );
    };

    if (!searched || !promoter) {
        return (
            <div className="max-w-md mx-auto py-10 px-4">
                <div className="bg-secondary shadow-2xl rounded-3xl p-8 border border-gray-800 text-center">
                    <MegaphoneIcon className="w-16 h-16 text-primary mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Minhas Tarefas</h1>
                    <p className="text-gray-400 text-sm mb-8">Digite seu e-mail para acessar suas postagens.</p>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="exemplo@gmail.com" className="w-full px-4 py-4 border border-gray-700 rounded-2xl bg-gray-800 text-white outline-none focus:ring-2 focus:ring-primary font-bold" required />
                        <button type="submit" disabled={isLoading} className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20">{isLoading ? 'BUSCANDO...' : 'ACESSAR TAREFAS'}</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto pb-20">
            <div className="flex justify-between items-start mb-8 px-2">
                <div className="flex-grow">
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight">Olá, {promoter.name.split(' ')[0]}!</h1>
                    
                    <div className="flex items-center gap-2 mt-1">
                        {isChangingEmail ? (
                            <form onSubmit={handleEmailChangeSubmit} className="flex items-center gap-2 w-full max-w-sm">
                                <input 
                                    type="email" 
                                    value={newEmailValue} 
                                    onChange={e => setNewEmailValue(e.target.value)}
                                    className="bg-gray-800 border border-gray-700 text-[10px] text-white px-2 py-1 rounded-lg focus:ring-1 focus:ring-primary outline-none flex-grow"
                                    placeholder="Novo e-mail..."
                                    autoFocus
                                    disabled={isUpdatingEmail}
                                />
                                <button type="submit" disabled={isUpdatingEmail} className="text-green-400 font-bold text-[10px] uppercase">{isUpdatingEmail ? '...' : 'OK'}</button>
                                <button type="button" onClick={() => setIsChangingEmail(false)} className="text-gray-500 font-bold text-[10px] uppercase">Sair</button>
                            </form>
                        ) : (
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-gray-500 font-mono">{promoter.email}</p>
                                <button 
                                    onClick={() => { setIsChangingEmail(true); setNewEmailValue(promoter.email); }}
                                    className="text-gray-600 hover:text-primary transition-colors p-1"
                                    title="Alterar E-mail"
                                >
                                    <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <button onClick={() => setIsStatsModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"><ChartBarIcon className="w-3 h-3" /> VER MEU STATUS</button>
                    </div>
                    {renderPushStatus()}
                </div>
                <button onClick={handleLogout} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-red-400 transition-colors ml-2"><LogoutIcon className="w-6 h-6" /></button>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-gray-700/50">
                <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'pending' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Ativas ({pending.length})</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'history' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Finalizadas ({history.length})</button>
            </div>

            <div className="space-y-2">
                {isLoading ? <div className="text-center py-20 animate-pulse text-primary font-black uppercase">Sincronizando tarefas...</div> : (
                    activeTab === 'pending' ? (
                        pending.length > 0 ? pending.map(a => <PostCard key={a.id} assignment={a} onConfirm={() => performSearch(email)} onJustify={setJustificationAssignment} onRefresh={() => performSearch(email)} />) 
                        : <div className="text-center py-20"><div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircleIcon className="w-8 h-8 text-green-500" /></div><p className="text-gray-400 font-bold">Tudo em dia por aqui! 🎉</p></div>
                    ) : (
                        history.length > 0 ? history.map(a => <PostCard key={a.id} assignment={a} onConfirm={()=>{}} onJustify={()=>{}} onRefresh={()=>{}} />) 
                        : <p className="text-center text-gray-500 py-10 font-bold">Nenhum histórico disponível.</p>
                    )
                )}
            </div>

            {showFixGuide && (
                <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-6 overflow-y-auto">
                    <div className="bg-secondary w-full max-w-lg p-8 rounded-3xl border border-red-500/50 shadow-2xl">
                         <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black text-red-500 uppercase tracking-tighter">Corrigindo Erro de Plugin</h3><button onClick={() => setShowFixGuide(false)} className="text-gray-400"><XIcon className="w-6 h-6"/></button></div>
                         <p className="text-gray-300 text-sm mb-6 leading-relaxed">O erro <code className="text-yellow-500">Not Implemented</code> no iOS ocorre porque o Xcode não incluiu o plugin de notificações na compilação final. Siga estes passos no seu computador de desenvolvimento:</p>
                         <div className="space-y-4 font-mono text-[10px]"><div className="bg-black p-4 rounded-xl border border-gray-800"><p className="text-gray-500 mb-2"># 1. Sincronize o código JavaScript com o iOS</p><p className="text-green-400">npx cap sync ios</p></div><div className="bg-black p-4 rounded-xl border border-gray-800"><p className="text-gray-500 mb-2"># 2. Reinstale as dependências nativas (Pods)</p><p className="text-green-400">cd ios/App && pod install && cd ../..</p></div><div className="bg-black p-4 rounded-xl border border-gray-800"><p className="text-gray-500 mb-2"># 3. Limpe o build anterior no Xcode</p><p className="text-gray-400">Pressione <span className="text-white">Command + Shift + K</span> dentro do Xcode.</p></div><div className="bg-black p-4 rounded-xl border border-gray-800"><p className="text-gray-500 mb-2"># 4. Compile novamente para o dispositivo físico</p><p className="text-gray-400">Dê o "Play" no Xcode para instalar a nova versão no celular.</p></div></div>
                         <button onClick={() => setShowFixGuide(false)} className="w-full mt-8 py-4 bg-gray-800 text-white font-black rounded-2xl">ENTENDI</button>
                    </div>
                </div>
            )}

            {justificationAssignment && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setJustificationAssignment(null)}>
                    <div className="bg-secondary w-full max-w-md p-8 rounded-3xl border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4"><h3 className="text-2xl font-black text-white uppercase tracking-tighter">Justificar Ausência</h3><button onClick={() => setJustificationAssignment(null)} className="text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button></div>
                        <p className="text-gray-400 text-sm mb-6">Explique por que você não poderá realizar esta postagem e anexe comprovantes (ex: atestado ou print de erro) se necessário.</p>
                        <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Descreva aqui o motivo..." rows={4} className="w-full p-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary mb-6" />
                        <div className="mb-6"><label className="block text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest">Anexar Provas (Máx 2 Imagens)</label><div className="flex flex-wrap gap-4">{justificationFiles.length < 2 && (<label className="flex-shrink-0 cursor-pointer bg-gray-800 w-20 h-20 rounded-2xl border-2 border-dashed border-gray-700 text-primary hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1"><CameraIcon className="w-6 h-6" /><span className="text-[8px] font-bold">ANEXAR</span><input type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple /></label>)}{justificationPreviews.map((p, i) => (<div key={i} className="relative group"><img src={p} className="h-20 w-20 rounded-2xl object-cover border-2 border-gray-700" alt="Preview" /><button onClick={() => removePreview(i)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg group-hover:scale-110 transition-transform"><XIcon className="w-3 h-3" /></button></div>))}</div></div>
                        <div className="flex gap-4"><button onClick={() => setJustificationAssignment(null)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-2xl">CANCELAR</button><button onClick={handleJustificationSubmit} disabled={isSubmittingJustification || !justificationText.trim()} className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-900/20 disabled:opacity-30">{isSubmittingJustification ? 'ENVIANDO...' : 'ENVIAR'}</button></div>
                    </div>
                </div>
            )}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
