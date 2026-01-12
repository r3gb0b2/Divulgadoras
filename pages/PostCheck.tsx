
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { getActiveVipEvents, getAllVipMemberships, trackVipTicketAction } from '../services/vipService';
import { PostAssignment, Promoter, VipMembership, VipEvent } from '../types';
import { 
    ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, 
    ExternalLinkIcon, CheckCircleIcon, WhatsAppIcon, MegaphoneIcon, 
    LogoutIcon, DocumentDuplicateIcon, SearchIcon, ChartBarIcon, 
    XIcon, RefreshIcon, AlertTriangleIcon, TicketIcon,
    SparklesIcon
} from '../components/Icons';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import VipTicket from '../components/VipTicket';

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
    if (!assignment.post?.isActive) return true;
    const now = new Date();
    const expiresAt = toDateSafe(assignment.post?.expiresAt);
    if (expiresAt && now > expiresAt) {
        if (assignment.post?.allowLateSubmissions) return false;
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

const PostCard: React.FC<{ 
    assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, 
    promoter: Promoter,
    onConfirm: (assignment: PostAssignment) => void, 
    onRefresh: () => void 
}> = ({ assignment, promoter, onConfirm, onRefresh }) => {
    const navigate = useNavigate();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [timeLeftForProof, setTimeLeftForProof] = useState('');
    const [isProofButtonEnabled, setIsProofButtonEnabled] = useState(false);
    const [countdownColor, setCountdownColor] = useState('text-gray-400');
    
    const [showJustifyForm, setShowJustifyForm] = useState(false);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);

    useEffect(() => {
        if (assignment.status !== 'confirmed' || !assignment.confirmedAt || assignment.proofSubmittedAt) return;
        
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;

        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        const calculatedEnableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);

        const timer = setInterval(() => {
            const now = new Date();

            if (now > expireTime) {
                if (assignment.post?.allowLateSubmissions) {
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

            if (assignment.post?.allowImmediateProof) {
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
                setTimeLeftForProof(`Envio Liberado! Em: ${h}h ${m}m`);
                setIsProofButtonEnabled(true);
                setCountdownColor('text-green-400 font-black');
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [assignment.status, assignment.confirmedAt, assignment.post?.allowLateSubmissions, assignment.post?.allowImmediateProof, assignment.proofSubmittedAt]);

    const handleConfirm = async () => {
        setIsConfirming(true);
        try { 
            await confirmAssignment(assignment.id); 
            onConfirm(assignment); 
        }
        catch (err: any) { alert(err.message); } finally { setIsConfirming(false); }
    };

    const handleSubmitJustification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!justificationText.trim()) return;
        setIsSubmittingJustification(true);
        try {
            await submitJustification(assignment.id, justificationText, justificationFiles);
            setShowJustifyForm(false);
            onRefresh();
            alert("Sua justificativa foi enviada para análise da produção.");
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsSubmittingJustification(false);
        }
    };

    const handleDownloadMedia = async () => {
        if (!assignment.post?.mediaUrl) return;
        setIsDownloading(true);
        try {
            let finalUrl = assignment.post.mediaUrl;
            if (!finalUrl.startsWith('http')) {
                const storageRef = storage.ref(assignment.post.mediaUrl);
                finalUrl = await storageRef.getDownloadURL();
            }
            window.open(finalUrl, '_blank');
        } catch (e) {
            alert("Erro ao baixar arquivo.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleCopyPostLink = () => {
        const linkToCopy = assignment.post?.copyLink || assignment.post?.postLink;
        if (!linkToCopy) return;
        navigator.clipboard.writeText(linkToCopy);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    return (
        <div className="bg-secondary rounded-3xl shadow-xl overflow-hidden border border-white/5 mb-6 animate-fadeIn">
            <div className="p-5 flex justify-between items-start bg-white/5">
                <div>
                    <p className="font-black text-white uppercase tracking-tight">{assignment.post?.campaignName}</p>
                    <p className="text-xs text-primary font-bold">{assignment.post?.eventName || 'Tarefa Designada'}</p>
                </div>
                <div className="p-2 bg-primary/10 rounded-xl text-primary"><MegaphoneIcon className="w-5 h-5"/></div>
            </div>
            <div className="p-5 space-y-4">
                <div className="bg-dark/50 p-4 rounded-2xl border border-white/5 text-sm text-gray-300 whitespace-pre-wrap italic font-medium">{assignment.post?.instructions}</div>
                
                <div className="space-y-3">
                    {assignment.post?.type !== 'text' && (
                        <div className="rounded-2xl overflow-hidden border border-white/5 bg-black">
                             <StorageMedia path={assignment.post?.mediaUrl || ''} type={assignment.post?.type as any} className="w-full h-auto max-h-64 object-contain mx-auto" />
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {assignment.post?.mediaUrl && (
                            <button onClick={handleDownloadMedia} disabled={isDownloading} className="flex items-center justify-center gap-2 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                                <DownloadIcon className="w-4 h-4" /> BAIXAR MÍDIA
                            </button>
                        )}
                        
                        {(assignment.post?.copyLink || assignment.post?.postLink) && (
                            <button onClick={handleCopyPostLink} className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${linkCopied ? 'bg-green-600 text-white border-green-500 shadow-lg shadow-green-900/20' : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'}`}>
                                <DocumentDuplicateIcon className="w-4 h-4" /> {linkCopied ? 'COPIADO!' : 'COPIAR LINK/CTA'}
                            </button>
                        )}
                        
                        {assignment.post?.postLink && (
                            <a href={assignment.post.postLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-4 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                                <ExternalLinkIcon className="w-4 h-4" /> ABRIR NO INSTAGRAM
                            </a>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="px-5 pb-5">
                {!assignment.proofSubmittedAt && !assignment.justification && (
                    <div className="flex flex-col gap-4">
                         {!showJustifyForm && (
                             <>
                                {assignment.status === 'pending' ? (
                                    <button onClick={handleConfirm} disabled={isConfirming} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all text-sm uppercase tracking-widest">{isConfirming ? 'GRAVANDO...' : 'EU JÁ POSTEI! 🚀'}</button>
                                ) : (
                                    <div className="space-y-4">
                                        <button 
                                            onClick={() => navigate(`/proof/${assignment.id}`)} 
                                            disabled={!isProofButtonEnabled} 
                                            className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 disabled:opacity-30 text-sm uppercase tracking-widest transition-all"
                                        >
                                            {isProofButtonEnabled ? 'ENVIAR PRINT' : 'AGUARDE O TEMPO'}
                                        </button>
                                        
                                        <div className="flex items-center justify-center gap-2 py-3 bg-dark/50 rounded-2xl border border-white/5">
                                            <ClockIcon className={`w-4 h-4 ${countdownColor}`} />
                                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${countdownColor}`}>{timeLeftForProof}</span>
                                        </div>
                                    </div>
                                )}
                             </>
                         )}

                        {assignment.post?.allowJustification !== false && (
                            <button 
                                onClick={() => setShowJustifyForm(!showJustifyForm)}
                                className={`w-full py-4 bg-transparent border-2 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${showJustifyForm ? 'border-gray-600 text-gray-500 hover:bg-gray-800' : 'border-orange-500/20 text-orange-400 hover:bg-orange-500/10'}`}
                            >
                                {showJustifyForm ? <XIcon className="w-4 h-4" /> : <AlertTriangleIcon className="w-4 h-4" />}
                                {showJustifyForm ? 'CANCELAR' : 'JUSTIFICAR AUSÊNCIA'}
                            </button>
                        )}

                        {showJustifyForm && (
                            <form onSubmit={handleSubmitJustification} className="p-5 bg-dark/50 rounded-3xl border border-orange-500/20 space-y-4 animate-slideDown">
                                <textarea 
                                    required value={justificationText} onChange={e => setJustificationText(e.target.value)}
                                    className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm outline-none focus:ring-1 focus:ring-orange-500"
                                    placeholder="Explique por que não pôde postar..." rows={3}
                                />
                                <button type="submit" disabled={isSubmittingJustification} className="w-full py-4 bg-orange-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-orange-500">
                                    {isSubmittingJustification ? 'ENVIANDO...' : 'ENVIAR JUSTIFICATIVA'}
                                </button>
                            </form>
                        )}
                    </div>
                )}

                {(assignment.proofSubmittedAt || assignment.justification) && (
                    <div className="p-4 bg-green-500/10 rounded-2xl border border-green-500/20 flex items-center gap-3">
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                        <p className="text-[10px] text-green-400 font-black uppercase tracking-widest">
                            {assignment.proofSubmittedAt ? 'Tarefa Concluída!' : 'Justificativa em Análise'}
                        </p>
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
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[]>([]);
    const [vipMemberships, setVipMemberships] = useState<VipMembership[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'vip'>('pending');
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [showTicketFor, setShowTicketFor] = useState<VipMembership | null>(null);

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
            
            const [fetchedAssignments, vips, allEvents] = await Promise.all([
                getAssignmentsForPromoterByEmail(searchEmail),
                getAllVipMemberships(),
                getActiveVipEvents()
            ]);

            setAssignments(fetchedAssignments.map(a => ({ ...a, promoterHasJoinedGroup: activePromoter.hasJoinedGroup || false })));
            
            // Enriquecer adesões com local e hora do evento
            const userVips = vips.filter(m => m.promoterEmail === searchEmail.toLowerCase().trim() && (m.status === 'confirmed' || m.status === 'refunded'));
            const enrichedVips = userVips.map(m => {
                const ev = allEvents.find(e => e.id === m.vipEventId);
                return {
                    ...m,
                    eventTime: ev?.eventTime || m.eventTime,
                    eventLocation: ev?.eventLocation || m.eventLocation
                };
            });
            setVipMemberships(enrichedVips);

        } catch (err) { alert("Erro ao carregar portal."); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        const initialTab = queryParams.get('tab') as any;
        if (initialTab) setActiveTab(initialTab);
        
        const savedEmail = localStorage.getItem('saved_promoter_email');
        if (emailFromQuery) performSearch(emailFromQuery);
        else if (savedEmail) performSearch(savedEmail);
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
                <div className="bg-secondary/40 backdrop-blur-xl shadow-2xl rounded-[3rem] p-10 border border-white/5 text-center">
                    <MegaphoneIcon className="w-16 h-16 text-primary mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white uppercase mb-2 tracking-tighter">Portal da Equipe</h1>
                    <p className="text-gray-500 text-sm mb-8 font-medium">Gerencie suas tarefas e benefícios.</p>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail de cadastro" className="w-full px-6 py-5 border border-gray-700 rounded-3xl bg-dark text-white font-bold outline-none focus:ring-2 focus:ring-primary" required />
                        <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-3xl shadow-xl uppercase text-xs tracking-widest">{isLoading ? 'BUSCANDO...' : 'ACESSAR AGORA'}</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto pb-20 px-2">
            <div className="flex justify-between items-center mb-8">
                <div className="min-w-0 flex-1 mr-4">
                    <h1 className="text-2xl font-black text-white uppercase truncate">Olá, {promoter.name.split(' ')[0]}!</h1>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">{promoter.email}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsStatsModalOpen(true)} className="p-3 bg-gray-800 text-primary rounded-2xl hover:bg-gray-700 border border-white/5 transition-all"><ChartBarIcon className="w-6 h-6"/></button>
                    <button onClick={handleLogout} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-red-400 border border-white/5 transition-all"><LogoutIcon className="w-6 h-6"/></button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 overflow-x-auto custom-scrollbar">
                <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 px-4 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'pending' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Pendentes ({pending.length})</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 px-4 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'history' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Histórico</button>
                <button onClick={() => setActiveTab('vip')} className={`flex-1 py-3 px-4 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'vip' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400'}`}>
                    <SparklesIcon className="w-3 h-3" /> Clube VIP ({vipMemberships.filter(m => m.status !== 'refunded').length})
                </button>
            </div>

            {activeTab === 'pending' && (
                <div className="space-y-4">
                    {pending.length === 0 ? (
                        <div className="bg-secondary/40 p-10 rounded-[2.5rem] border border-white/5 text-center">
                            <CheckCircleIcon className="w-12 h-12 text-green-600 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Tudo em dia! Nenhuma tarefa pendente.</p>
                        </div>
                    ) : pending.map(a => <PostCard key={a.id} assignment={a} promoter={promoter} onConfirm={() => performSearch(promoter.email)} onRefresh={() => performSearch(promoter.email)} />)}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-3">
                    {history.length === 0 ? (
                        <p className="text-center text-gray-600 font-bold uppercase text-[10px] py-10 tracking-widest">Nenhum histórico disponível.</p>
                    ) : history.map(a => (
                        <div key={a.id} className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex justify-between items-center group">
                            <div className="min-w-0">
                                <p className="text-white font-black text-xs uppercase truncate">{a.post?.campaignName || 'Evento'}</p>
                                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mt-1">{toDateSafe(a.proofSubmittedAt || a.createdAt)?.toLocaleDateString('pt-BR')}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border ${a.proofSubmittedAt || a.justificationStatus === 'accepted' ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-red-900/30 text-red-400 border-red-800'}`}>
                                {a.proofSubmittedAt ? 'Enviado' : a.justificationStatus === 'accepted' ? 'Justificado' : 'Perdido'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'vip' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 ml-4">
                        <div className="w-8 h-8 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                            <SparklesIcon className="w-4 h-4" />
                        </div>
                        <h2 className="text-lg font-black text-white uppercase tracking-tight">Meus Ingressos VIP</h2>
                    </div>
                    
                    {vipMemberships.length === 0 ? (
                        <div className="bg-secondary/40 p-10 rounded-[2.5rem] border border-white/5 text-center">
                            <TicketIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma adesão confirmada.</p>
                            <Link to="/clubvip" className="mt-6 inline-block text-primary font-black uppercase text-[10px] tracking-widest hover:underline">Ver Clube VIP</Link>
                        </div>
                    ) : (
                        <div className="grid gap-6">
                            {vipMemberships.map(m => (
                                <div key={m.id} className={`bg-secondary/60 backdrop-blur-lg rounded-[2.5rem] p-8 border ${m.status === 'refunded' ? 'border-red-500/30 grayscale' : 'border-indigo-500/20'} shadow-2xl relative overflow-hidden group`}>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="text-left">
                                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">{m.vipEventName}</h2>
                                            {m.status === 'refunded' ? (
                                                <p className="text-[9px] text-red-400 font-black uppercase tracking-[0.3em] mt-2">Estornado ❌</p>
                                            ) : (
                                                <p className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-2">Membro Clube VIP ✅</p>
                                            )}
                                        </div>
                                        <div className={`p-3 rounded-xl ${m.status === 'refunded' ? 'bg-red-500/10 text-red-500' : 'bg-indigo-500/10 text-indigo-400'}`}><TicketIcon className="w-6 h-6"/></div>
                                    </div>
                                    
                                    {m.status !== 'refunded' ? (
                                        <div className="p-4 bg-dark/60 rounded-2xl border border-white/5 space-y-4">
                                            <div className="text-center">
                                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Código de Acesso</p>
                                                <p className="text-2xl font-black text-indigo-400 font-mono">{m.benefitCode || '---'}</p>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setShowTicketFor(m);
                                                    trackVipTicketAction(m.id, 'view').catch(() => {});
                                                }}
                                                className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-500 transition-all transform active:scale-95"
                                            >
                                                VER MEU INGRESSO DIGITAL
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-red-900/10 rounded-2xl border border-red-500/20 text-center">
                                            <p className="text-[10px] text-red-400 font-bold uppercase">Este acesso foi cancelado e estornado.</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
            
            {showTicketFor && (
                <VipTicket 
                    membership={showTicketFor} 
                    onClose={() => setShowTicketFor(null)} 
                />
            )}
        </div>
    );
};

export default PostCheck;
