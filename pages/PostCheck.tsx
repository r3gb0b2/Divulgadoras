
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter, updateAssignment, scheduleWhatsAppReminder } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { initPushNotifications } from '../services/pushService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon, CalendarIcon, WhatsAppIcon, MegaphoneIcon, ChartBarIcon, TrashIcon, FaceIdIcon } from '../components/Icons';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import firebase from 'firebase/compat/app';
import { Capacitor } from '@capacitor/core';

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
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
                setTimeLeft(timeString); setIsExpired(false);
            } else {
                setTimeLeft('Encerrado'); setIsExpired(true);
            }
        };
        updateTimer(); const timer = setInterval(updateTimer, 60000);
        return () => clearInterval(timer);
    }, [targetDate]);
    if (!timeLeft) return null;
    return <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-1 ${isExpired ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}><ClockIcon className="h-4 w-4" /><span>{prefix}{timeLeft}</span></div>;
};

const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void, onReminderRequested: () => void }> = ({ assignment, onConfirm, onJustify, onReminderRequested }) => {
    const navigate = useNavigate();
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [timeLeftForProof, setTimeLeftForProof] = useState('');
    const [isProofButtonEnabled, setIsProofButtonEnabled] = useState(false);
    const [enableTimeDate, setEnableTimeDate] = useState<Date | null>(null);
    const [isRequestingReminder, setIsRequestingReminder] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    
    const allowJustification = assignment.post.allowJustification !== false;
    const isPostExpired = useMemo(() => {
        const expiresAt = toDateSafe(assignment.post.expiresAt);
        return (expiresAt && new Date() > expiresAt) || !assignment.post.isActive;
    }, [assignment.post.expiresAt, assignment.post.isActive]);
    
    useEffect(() => {
        if (assignment.status !== 'confirmed' || !assignment.confirmedAt) return;
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        const calculatedEnableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);
        setEnableTimeDate(calculatedEnableTime);
        const timer = setInterval(() => {
            const now = new Date();
            if (now > expireTime) {
                setTimeLeftForProof(assignment.post.allowLateSubmissions ? 'Envio fora do prazo liberado' : 'Tempo esgotado');
                setIsProofButtonEnabled(assignment.post.allowLateSubmissions === true);
                clearInterval(timer);
                return;
            }
            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000);
                setTimeLeftForProof(`Envio liberado! Expira em: ${h}h ${m}m`); setIsProofButtonEnabled(true); return;
            }
            if (now < calculatedEnableTime) {
                const diff = calculatedEnableTime.getTime() - now.getTime();
                const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000); const s = Math.floor((diff % 60000) / 1000);
                setTimeLeftForProof(`Print liberado em ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
                setIsProofButtonEnabled(false);
            } else {
                const diff = expireTime.getTime() - now.getTime();
                const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000);
                setTimeLeftForProof(`Expira em: ${h}h ${m}m`); setIsProofButtonEnabled(true);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [assignment.status, assignment.confirmedAt, assignment.post.allowLateSubmissions, assignment.post.allowImmediateProof]);

    if (!assignment.promoterHasJoinedGroup) {
        return (<div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500"><h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}<p className="mt-2 text-yellow-300">Você tem uma nova publicação para este evento!</p><p className="mt-2 text-gray-300 text-sm">Para visualizar, primeiro você precisa confirmar a leitura das regras e entrar no grupo do WhatsApp.</p><div className="mt-4 text-center"><Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors">Verificar Status e Aceitar Regras</Link></div></div>);
    }

    const handleConfirm = async () => {
        if (isPostExpired) { alert("O tempo para esta postagem foi encerrado."); return; }
        const wantsReminder = window.confirm("Você postou? Ótimo! Seu próximo passo é enviar o print em 6 horas.\n\nDeseja que a gente te lembre no WhatsApp?");
        try {
            if (wantsReminder) {
                await scheduleWhatsAppReminder(assignment.id);
                alert("Lembrete agendado com sucesso! Você receberá uma mensagem no WhatsApp.");
            }
            await confirmAssignment(assignment.id);
            if (wantsReminder) {
                await updateAssignment(assignment.id, { whatsAppReminderRequestedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
            await onConfirm(assignment);
        } catch (err: any) { alert((err as Error).message); }
    };
    const handleCopyLink = () => { if (!assignment.post.postLink) return; navigator.clipboard.writeText(assignment.post.postLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }); };
    const handleFirebaseDownload = async () => {
        if (!assignment.post.mediaUrl) return;
        setIsDownloading(true);
        try {
            const path = assignment.post.mediaUrl;
            let finalUrl = path;
            if (!path.startsWith('http')) {
                const storageRef = storage.ref(path);
                finalUrl = await storageRef.getDownloadURL();
            }
            const link = document.createElement('a');
            link.href = finalUrl; link.target = '_blank';
            link.setAttribute('download', 'midia_post'); 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) { alert("Erro ao baixar a mídia."); } finally { setIsDownloading(false); }
    };

    const handleRequestReminder = async () => { setIsRequestingReminder(true); try { await scheduleWhatsAppReminder(assignment.id); onReminderRequested(); } catch (err: any) { alert(err.message || "Erro ao agendar lembrete."); setIsRequestingReminder(false); } };

    return (
        <div className="bg-dark/70 rounded-lg shadow-md overflow-hidden border border-gray-700/50">
            <div className="p-4">
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>
                        {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {assignment.proofSubmittedAt ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">Concluído</span> : (assignment.justification ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Justificativa Enviada</span> : (assignment.status === 'confirmed' ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-900/50 text-blue-300">Confirmado</span> : <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>))}
                        {assignment.post.expiresAt && <CountdownTimer targetDate={assignment.post.expiresAt} prefix="Expira em: " />}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-gray-700/50">
                <div className="space-y-4">
                     {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                        <div><StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} controls={assignment.post.type === 'video'} className="w-full h-auto object-contain rounded-md bg-dark" />
                            <div className="flex justify-center gap-4 mt-2">
                                {assignment.post.mediaUrl && <button onClick={handleFirebaseDownload} disabled={isDownloading} className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md text-xs font-semibold hover:bg-gray-500 disabled:opacity-50"><DownloadIcon className="w-4 h-4"/>{isDownloading ? 'Baixando...' : 'Link 1'}</button>}
                                {assignment.post.googleDriveUrl && <button onClick={() => window.open(assignment.post.googleDriveUrl, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-500"><DownloadIcon className="w-4 h-4"/>Link 2</button>}
                            </div>
                        </div>
                    )}
                </div>
                <div className="space-y-4">
                    <div><h4 className="font-semibold text-gray-200 text-sm mb-1">Instruções:</h4><div className="bg-gray-800/50 p-3 rounded-md text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</div></div>
                    {assignment.post.postLink && <div><h4 className="font-semibold text-gray-200 text-sm mb-1">Link para Postagem:</h4><div className="bg-gray-800/50 p-2 rounded-md flex items-center gap-2"><input type="text" readOnly value={assignment.post.postLink} className="flex-grow w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-xs"/><button onClick={handleCopyLink} className="flex-shrink-0 px-2 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-xs w-20">{linkCopied ? 'Copiado!' : 'Copiar'}</button></div></div>}
                </div>
            </div>
            <div className="border-t border-gray-700/50">
                {!assignment.proofSubmittedAt && !assignment.justification && (
                    <div className="p-4 text-center">
                        {assignment.status === 'pending' ? (
                            <div className="flex flex-col sm:flex-row gap-2">
                                {allowJustification && <button onClick={() => onJustify(assignment)} className="flex-1 px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500">Justificar Ausência</button>}
                                <button onClick={handleConfirm} disabled={isConfirming || isPostExpired} className="flex-1 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 text-lg">Eu postei!</button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {timeLeftForProof === 'Tempo esgotado' && allowJustification ? (
                                    <button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500">Justificar Ausência</button>
                                ) : (
                                    <>
                                        <button onClick={() => navigate(`/proof/${assignment.id}`)} disabled={!isProofButtonEnabled} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">Enviar Comprovação</button>
                                        <div className="flex justify-center gap-3">
                                            <button onClick={handleRequestReminder} disabled={isRequestingReminder || !!assignment.whatsAppReminderRequestedAt} className="inline-flex items-center gap-2 px-4 py-2 bg-green-900/30 text-green-300 border border-green-700/50 rounded-full hover:bg-green-900/50 text-xs font-semibold disabled:opacity-50"><WhatsAppIcon className="w-4 h-4" />{assignment.whatsAppReminderRequestedAt ? 'Lembrete Agendado!' : 'Lembrete no WhatsApp'}</button>
                                        </div>
                                    </>
                                )}
                                <p className={`text-xs ${timeLeftForProof === 'Tempo esgotado' ? 'text-red-400' : 'text-gray-400'}`}>{timeLeftForProof}</p>
                            </div>
                        )}
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
    const [activeTab, setActiveTab] = useState<'pending' | 'scheduled' | 'history'>('pending');
    
    // Push State
    const [isPushRegistered, setIsPushRegistered] = useState(false);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setError(null); setAssignments([]); setScheduledPosts([]); setSearched(true);
        try {
            const [promoterProfiles, fetchedAssignments, fetchedScheduled] = await Promise.all([findPromotersByEmail(searchEmail), getAssignmentsForPromoterByEmail(searchEmail), getScheduledPostsForPromoter(searchEmail)]);
            if (promoterProfiles.length === 0) { setError("Nenhum cadastro encontrado com este e-mail."); setIsLoading(false); return; }
            
            const activePromoter = promoterProfiles[0];
            setPromoter(activePromoter);
            
            // Register Push Notification Token IMMEDIATELY if on App
            if (Capacitor.isNativePlatform()) {
                initPushNotifications(activePromoter.id).then(success => {
                    setIsPushRegistered(success);
                });
            }

            const assignmentsWithGroupStatus = fetchedAssignments.map(assignment => { const promoterProfile = promoterProfiles.find(p => p.id === assignment.promoterId); return { ...assignment, promoterHasJoinedGroup: promoterProfile?.hasJoinedGroup || false }; });
            setAssignments(assignmentsWithGroupStatus); setScheduledPosts(fetchedScheduled);
        } catch (err: any) { setError(err.message || 'Ocorreu um erro ao buscar.'); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { const queryParams = new URLSearchParams(location.search); const emailFromQuery = queryParams.get('email'); if (emailFromQuery) { setEmail(emailFromQuery); performSearch(emailFromQuery); } }, [location.search, performSearch]);
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); navigate(`/posts?email=${encodeURIComponent(email)}`); };
    const handleConfirmAssignment = async () => { performSearch(email); };
    const handleReminderRequested = async () => { alert("Lembrete agendado com sucesso!"); performSearch(email); };

    const pendingAssignments = assignments.filter(a => !isHistoryAssignment(a));
    const historyAssignments = assignments.filter(a => isHistoryAssignment(a));

    return (
        <div className="max-w-3xl mx-auto">
            {!searched || !promoter ? (
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                    <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver suas tarefas.</p>
                    <form onSubmit={handleSubmit}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" required /><button type="submit" disabled={isLoading} className="mt-4 w-full py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">{isLoading ? 'Buscando...' : 'Ver Tarefas'}</button></form>
                </div>
            ) : (
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Olá, {promoter.name.split(' ')[0]}!</h1>
                            <p className="text-gray-400">Aqui estão suas tarefas de divulgação.</p>
                        </div>
                        <button onClick={() => setIsStatsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 font-semibold"><ChartBarIcon className="w-5 h-5"/> Minhas Stats</button>
                    </div>
                    
                    {/* FEEDBACK PUSH */}
                    {Capacitor.isNativePlatform() && (
                        <div className={`p-3 rounded-lg border flex items-center gap-3 ${isPushRegistered ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-blue-900/20 border-blue-800 text-blue-400'}`}>
                            <FaceIdIcon className="w-5 h-5" />
                            <span className="text-sm font-medium">
                                {isPushRegistered ? 'Celular vinculado para notificações push!' : 'Vinculando dispositivo para notificações...'}
                            </span>
                        </div>
                    )}
                </div>
            )}
            
            {searched && promoter && (
                <div className="mt-8">
                    <div className="mb-6 border-b border-gray-700">
                        <nav className="-mb-px flex space-x-6">
                            <button onClick={() => setActiveTab('pending')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'pending' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>Pendentes ({pendingAssignments.length})</button>
                            <button onClick={() => setActiveTab('scheduled')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'scheduled' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>Agendadas ({scheduledPosts.length})</button>
                            <button onClick={() => setActiveTab('history')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>Histórico ({historyAssignments.length})</button>
                        </nav>
                    </div>

                    <div className="space-y-6">
                        {activeTab === 'pending' && (pendingAssignments.length > 0 ? pendingAssignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirmAssignment} onJustify={setJustificationAssignment} onReminderRequested={handleReminderRequested} />) : <p className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">Nenhuma tarefa pendente! 🎉</p>)}
                        {activeTab === 'scheduled' && (scheduledPosts.length > 0 ? scheduledPosts.map(p => (<div key={p.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between"><p className="font-semibold text-white">{p.postData.campaignName}</p><span className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-500/30">Agendado</span></div>)) : <p className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">Nenhuma publicação agendada.</p>)}
                        {activeTab === 'history' && (historyAssignments.length > 0 ? historyAssignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={()=>{}} onJustify={()=>{}} onReminderRequested={()=>{}} />) : <p className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">Seu histórico está vazio.</p>)}
                    </div>
                </div>
            )}

            {justificationAssignment && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold text-white mb-4">Justificar Ausência</h3>
                        <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Motivo..." rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 mb-4 text-white" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setJustificationAssignment(null)} className="px-4 py-2 bg-gray-600 text-white rounded-md">Cancelar</button>
                            <button onClick={async () => {
                                setIsSubmittingJustification(true);
                                try { await submitJustification(justificationAssignment.id, justificationText, justificationFiles); setJustificationAssignment(null); performSearch(email); } catch (err: any) { alert(err.message); } finally { setIsSubmittingJustification(false); }
                            }} disabled={isSubmittingJustification} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">{isSubmittingJustification ? 'Enviando...' : 'Enviar'}</button>
                        </div>
                    </div>
                </div>
            )}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
