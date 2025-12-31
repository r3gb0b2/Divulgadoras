
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, scheduleProofPushReminder } from '../services/postService';
import { findPromotersByEmail, changePromoterEmail } from '../services/promoterService';
import { getActiveVipEvents, getAllVipMemberships } from '../services/vipService';
import { testSelfPush } from '../services/messageService';
import { PostAssignment, Promoter, VipMembership, VipEvent } from '../types';
import { 
    ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, 
    ExternalLinkIcon, CheckCircleIcon, WhatsAppIcon, MegaphoneIcon, 
    LogoutIcon, DocumentDuplicateIcon, SearchIcon, ChartBarIcon, 
    XIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon, PencilIcon, TicketIcon,
    SparklesIcon
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
            alert("Lembrete agendado!");
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
            alert("Erro ao baixar arquivo.");
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
                  Você precisa entrar no grupo oficial desta produtora para que as tarefas sejam liberadas.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="flex-1 flex items-center justify-center gap-2 py-3 bg-yellow-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:yellow-500 transition-colors">ACEITAR REGRAS</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-secondary rounded-3xl shadow-xl overflow-hidden border border-gray-800 mb-6 animate-fadeIn">
            <div className="p-5 flex justify-between items-start bg-white/5">
                <div>
                    <p className="font-black text-white uppercase tracking-tight">{assignment.post.campaignName}</p>
                    <p className="text-xs text-primary font-bold">{assignment.post.eventName || 'Tarefa Designada'}</p>
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
                        </div>
                    </div>
                )}
            </div>
            <div className="px-5 pb-5">
                {!assignment.proofSubmittedAt && (
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
                                    {isProofButtonEnabled ? 'ENVIAR PRINT' : 'AGUARDE O TEMPO'}
                                </button>
                                <div className="flex items-center justify-center gap-2 py-2 bg-dark/30 rounded-xl">
                                    <ClockIcon className={`w-4 h-4 ${countdownColor}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${countdownColor}`}>{timeLeftForProof}</span>
                                </div>
                            </div>
                        )}
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
    const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'rewards'>('pending');
    
    const [vipMemberships, setVipMemberships] = useState<VipMembership[]>([]);
    const [vipEventsMap, setVipEventsMap] = useState<Record<string, VipEvent>>({});

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Código copiado!");
    };

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setSearched(true);
        try {
            const profiles = await findPromotersByEmail(searchEmail);
            if (profiles.length === 0) { 
              alert("E-mail não encontrado."); setSearched(false); setIsLoading(false); return; 
            }
            
            const activePromoter = profiles[0];
            setPromoter(activePromoter);
            localStorage.setItem('saved_promoter_email', searchEmail.toLowerCase().trim());
            
            const [fetchedAssignments, vipData, allVipEvents] = await Promise.all([
                getAssignmentsForPromoterByEmail(searchEmail),
                getAllVipMemberships(),
                getActiveVipEvents()
            ]);

            const userVips = vipData.filter(m => m.promoterEmail === searchEmail.toLowerCase().trim() && m.status === 'confirmed');
            setVipMemberships(userVips);
            
            const eventMap = allVipEvents.reduce((acc, ev) => ({...acc, [ev.id]: ev}), {} as Record<string, VipEvent>);
            setVipEventsMap(eventMap);

            setAssignments(fetchedAssignments.map(a => ({...a, promoterHasJoinedGroup: true})));
        } catch (err: any) { alert("Erro ao carregar dados."); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        const savedEmail = localStorage.getItem('saved_promoter_email');
        if (emailFromQuery) { setEmail(emailFromQuery); performSearch(emailFromQuery); }
        else if (savedEmail) { setEmail(savedEmail); performSearch(savedEmail); }
    }, [location.search, performSearch]);

    const handleLogout = () => {
        localStorage.removeItem('saved_promoter_email');
        setPromoter(null); setSearched(false); setEmail(''); setAssignments([]);
    };

    const pending = assignments.filter(a => !isHistoryAssignment(a));
    const history = assignments.filter(a => isHistoryAssignment(a));

    if (!searched || !promoter) {
        return (
            <div className="max-w-md mx-auto py-10 px-4">
                <div className="bg-secondary shadow-2xl rounded-3xl p-8 border border-gray-800 text-center">
                    <MegaphoneIcon className="w-16 h-16 text-primary mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white uppercase mb-2">Portal da Equipe</h1>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail de cadastro" className="w-full px-4 py-4 border border-gray-700 rounded-2xl bg-gray-800 text-white" required />
                        <button type="submit" disabled={isLoading} className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-xl">{isLoading ? 'BUSCANDO...' : 'ACESSAR AGORA'}</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto pb-20">
            <div className="flex justify-between items-start mb-8 px-2">
                <div>
                    <h1 className="text-2xl font-black text-white uppercase truncate">Olá, {promoter.name.split(' ')[0]}!</h1>
                    <p className="text-xs text-gray-500 font-mono truncate">{promoter.email}</p>
                </div>
                <button onClick={handleLogout} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-red-400 transition-colors"><LogoutIcon className="w-6 h-6" /></button>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-gray-700/50">
                <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'pending' ? 'bg-primary text-white' : 'text-gray-500'}`}>Ativas</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'history' ? 'bg-primary text-white' : 'text-gray-500'}`}>Histórico</button>
                <button onClick={() => setActiveTab('rewards')} className={`flex-1 py-3 text-xs font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'rewards' ? 'bg-primary text-white' : 'text-gray-500'}`}>
                    <SparklesIcon className="w-3 h-3" /> Clube VIP
                </button>
            </div>

            <div className="space-y-2">
                {activeTab === 'pending' ? (
                    pending.length > 0 ? pending.map(a => <PostCard key={a.id} assignment={a} promoter={promoter} onConfirm={() => performSearch(email)} onJustify={()=>{}} onRefresh={() => performSearch(email)} />) 
                    : <div className="text-center py-20 text-gray-400 font-bold">Sem tarefas pendentes.</div>
                ) : activeTab === 'history' ? (
                    history.length > 0 ? history.map(a => <PostCard key={a.id} assignment={a} promoter={promoter} onConfirm={()=>{}} onJustify={()=>{}} onRefresh={()=>{}} />) 
                    : <p className="text-center text-gray-500 py-10 font-bold">Histórico Vazio</p>
                ) : (
                    <div className="space-y-4 animate-fadeIn">
                        {vipMemberships.length > 0 ? vipMemberships.map(m => {
                            const event = vipEventsMap[m.vipEventId];
                            const directLink = event?.externalSlug && m.benefitCode 
                                ? `https://stingressos.com.br/eventos/${event.externalSlug}?cupom=${m.benefitCode}`
                                : null;

                            return (
                                <div key={m.id} className="bg-secondary p-6 rounded-[2rem] border border-white/5 shadow-xl">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                                            <SparklesIcon className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase">{m.vipEventName}</h3>
                                            <p className="text-[10px] text-primary font-black uppercase">Membro Oficial</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {m.isBenefitActive ? (
                                            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-2xl text-center">
                                                <p className="text-white font-black uppercase text-sm">INGRESSO PROMOCIONAL DISPONÍVEL! 🚀</p>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-2xl text-center">
                                                <p className="text-white font-black uppercase text-sm">LIBERAÇÃO EM ANDAMENTO</p>
                                            </div>
                                        )}
                                        
                                        <div className="bg-dark/50 p-5 rounded-2xl border border-white/5 space-y-4">
                                            <div>
                                                <p className="text-[10px] text-gray-500 font-black uppercase mb-2 ml-1">Seu Código:</p>
                                                <div 
                                                    onClick={() => m.isBenefitActive && m.benefitCode && handleCopy(m.benefitCode)}
                                                    className={`p-3 bg-black/40 rounded-xl border border-primary/20 text-center select-all flex items-center justify-between transition-all ${m.isBenefitActive ? 'cursor-pointer hover:bg-black/60' : ''}`}
                                                >
                                                    <p className="text-lg font-black text-primary font-mono">{m.isBenefitActive ? (m.benefitCode || '---') : '******'}</p>
                                                    {m.isBenefitActive && <div className="p-2 text-gray-500 hover:text-white"><DocumentDuplicateIcon className="w-4 h-4"/></div>}
                                                </div>
                                                {m.isBenefitActive && <p className="text-[8px] text-gray-500 uppercase font-black text-center mt-2 tracking-widest">Clique no código para copiar</p>}
                                            </div>

                                            {m.isBenefitActive && directLink && (
                                                <a 
                                                    href={directLink} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="block w-full py-4 bg-green-600 text-white font-black rounded-2xl text-center shadow-lg hover:bg-green-500 transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                                                >
                                                    <ExternalLinkIcon className="w-4 h-4" /> RESGATAR INGRESSO PROMOCIONAL
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="bg-secondary p-8 rounded-[2.5rem] border border-white/5 shadow-xl text-center">
                                <SparklesIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                                <h3 className="text-xl font-black text-white uppercase">Seja Membro VIP!</h3>
                                <p className="text-gray-400 text-sm mt-2 mb-6">Acesse benefícios exclusivos e ingressos promocionais.</p>
                                <Link to="/clubvip" className="block w-full py-4 bg-primary text-white font-black rounded-2xl uppercase text-xs shadow-lg">QUERO SER MEMBRO</Link>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PostCheck;
