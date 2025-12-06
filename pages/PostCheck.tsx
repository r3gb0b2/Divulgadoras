
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter, updateAssignment, scheduleWhatsAppReminder } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon, CalendarIcon, WhatsAppIcon, MegaphoneIcon, ChartBarIcon } from '../components/Icons';
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

const formatDateForICS = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
};

const isHistoryAssignment = (assignment: PostAssignment): boolean => {
    // 1. Proof Submitted -> History (Done)
    if (assignment.proofSubmittedAt) return true;

    // 2. Justification Logic
    if (assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') {
        return true;
    }
    
    // 3. Post Deactivated -> History
    if (!assignment.post.isActive) return true;

    // 4. Check Expiration
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
                const seconds = Math.floor((difference / 1000) % 60);
                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
                setTimeLeft(timeString); setIsExpired(false);
            } else {
                setTimeLeft('Encerrado'); setIsExpired(true);
            }
        };
        updateTimer(); const timer = setInterval(updateTimer, 1000 * 60); // Update every minute
        return () => clearInterval(timer);
    }, [targetDate]);
    if (!timeLeft) return null;
    return <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-1 ${isExpired ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}><ClockIcon className="h-4 w-4" /><span>{prefix}{timeLeft}</span></div>;
};

const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void, onReminderRequested: () => void }> = ({ assignment, onConfirm, onJustify, onReminderRequested }) => {
    const navigate = useNavigate();
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isMediaProcessing, setIsMediaProcessing] = useState(false);
    
    // States from old ProofSection
    const [timeLeftForProof, setTimeLeftForProof] = useState('');
    const [isProofButtonEnabled, setIsProofButtonEnabled] = useState(false);
    const [enableTimeDate, setEnableTimeDate] = useState<Date | null>(null);
    const [isRequestingReminder, setIsRequestingReminder] = useState(false);
    const allowJustification = assignment.post.allowJustification !== false;
    
    // This effect replaces the old ProofSection logic
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

    const handleConfirm = async () => { setIsConfirming(true); try { await onConfirm(assignment); } finally { setIsConfirming(false); } };
    const handleCopyLink = () => { if (!assignment.post.postLink) return; navigator.clipboard.writeText(assignment.post.postLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(err => { console.error('Failed to copy link: ', err); alert('Falha ao copiar link.'); }); };
    
    const handleFirebaseDownload = async () => { if (isMediaProcessing || !assignment.post.mediaUrl) return; setIsMediaProcessing(true); try { const path = assignment.post.mediaUrl; let finalUrl = path; if (!path.startsWith('http')) { const storageRef = storage.ref(path); finalUrl = await storageRef.getDownloadURL(); } const link = document.createElement('a'); link.href = finalUrl; const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download'; link.setAttribute('download', filename); link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); document.body.appendChild(link); link.click(); document.body.removeChild(link); } catch (error: any) { console.error('Failed to download from Firebase:', error); alert(`Não foi possível baixar a mídia do Link 1: ${error.message}`); } finally { setIsMediaProcessing(false); } };
    const handleGoogleDriveDownload = () => { if (!assignment.post.googleDriveUrl) return; const { googleDriveUrl, type } = assignment.post; let urlToOpen = googleDriveUrl; if (type === 'video') { const fileId = extractGoogleDriveId(googleDriveUrl); if (fileId) { urlToOpen = `https://drive.google.com/uc?export=download&id=${fileId}`; } } window.open(urlToOpen, '_blank'); };
    
    const handleAddToCalendar = () => { if (!enableTimeDate) return; const title = `Enviar Print - ${assignment.post.campaignName}`; const description = `Está na hora de enviar o print da sua publicação!\\n\\nAcesse o link para enviar: ${window.location.href}`; const endDate = new Date(enableTimeDate.getTime() + 60 * 60 * 1000); const now = formatDateForICS(new Date()); const start = formatDateForICS(enableTimeDate); const end = formatDateForICS(endDate); const icsContent = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Equipe Certa//NONSGML v1.0//EN', 'BEGIN:VEVENT', `UID:${now}-${Math.random().toString(36).substring(2)}@equipecerta.com`, `DTSTAMP:${now}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${title}`, `DESCRIPTION:${description}`, `URL:${window.location.href}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'); const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' }); const link = document.createElement('a'); link.href = window.URL.createObjectURL(blob); link.setAttribute('download', 'lembrete_post.ics'); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const handleRequestReminder = async () => { setIsRequestingReminder(true); try { await scheduleWhatsAppReminder(assignment.id); onReminderRequested(); } catch (err: any) { alert(err.message || "Erro ao agendar lembrete."); setIsRequestingReminder(false); } };

    const renderStatusBadge = () => {
        if (assignment.proofSubmittedAt) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">Concluído</span>;
        if (assignment.justification) {
            const status = assignment.justificationStatus || 'pending';
            const styles = { pending: "bg-yellow-900/50 text-yellow-300", accepted: "bg-green-900/50 text-green-300", rejected: "bg-red-900/50 text-red-300" };
            return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>Justificativa {status === 'pending' ? 'Pendente' : (status === 'accepted' ? 'Aceita' : 'Rejeitada')}</span>;
        }
        if (assignment.status === 'confirmed') return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-900/50 text-blue-300">Confirmado</span>;
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>;
    };
    
    const renderActionFooter = () => {
        if (assignment.proofSubmittedAt) {
            return (
                <div className="text-center p-4">
                    <p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>
                    {assignment.proofImageUrls && assignment.proofImageUrls.length > 0 && assignment.proofImageUrls[0] !== 'manual' &&
                        <div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, i) => (<a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Prova ${i+1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div>
                    }
                </div>
            );
        }
        if (assignment.justification) {
            return (
                 <div className="p-4 text-center">
                    <p className="text-sm text-yellow-300 font-semibold mb-2">Justificativa Enviada</p>
                    <p className="text-sm italic text-gray-300 bg-gray-800 p-2 rounded-md mb-2">"{assignment.justification}"</p>
                    {assignment.justificationResponse && <div className="mt-2 text-left bg-dark p-3 rounded-md border-l-4 border-primary"><p className="text-sm font-semibold text-primary mb-1">Resposta:</p><p className="text-sm text-gray-300 whitespace-pre-wrap">{assignment.justificationResponse}</p></div>}
                </div>
            );
        }
        if (assignment.status === 'pending') {
            return (
                <div className="flex flex-col sm:flex-row gap-2 p-4">
                    {allowJustification && <button onClick={() => onJustify(assignment)} className="flex-1 px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500">Justificar Ausência</button>}
                    <button onClick={handleConfirm} disabled={isConfirming} className="flex-1 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 text-lg">Eu vou postar!</button>
                </div>
            );
        }
        if (assignment.status === 'confirmed') {
             const isProofDeadlineExpired = timeLeftForProof === 'Tempo esgotado';
             return (
                <div className="p-4 text-center space-y-3">
                    {isProofDeadlineExpired && allowJustification ? (
                         <button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500">Justificar Ausência</button>
                    ) : (
                         <>
                            <button onClick={() => navigate(`/proof/${assignment.id}`)} disabled={!isProofButtonEnabled} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Enviar Comprovação</button>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                {!isProofButtonEnabled && enableTimeDate && <button onClick={handleAddToCalendar} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-900/30 text-indigo-300 text-xs font-semibold rounded-full border border-indigo-500/30 hover:bg-indigo-900/50"><CalendarIcon className="w-3 h-3" />Agendar Lembrete</button>}
                                <button onClick={handleRequestReminder} disabled={isRequestingReminder || !!assignment.whatsAppReminderRequestedAt} className="inline-flex items-center gap-2 px-4 py-2 bg-green-900/30 text-green-300 border border-green-700/50 rounded-full hover:bg-green-900/50 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"><WhatsAppIcon className="w-4 h-4" />{isRequestingReminder ? 'Agendando...' : (assignment.whatsAppReminderRequestedAt ? 'Lembrete Agendado!' : 'Lembrete no WhatsApp')}</button>
                            </div>
                        </>
                    )}
                    <p className={`text-xs ${isProofDeadlineExpired ? 'text-red-400' : 'text-gray-400'}`}>{timeLeftForProof}</p>
                </div>
             );
        }
        return null;
    };

    return (
        <div className="bg-dark/70 rounded-lg shadow-md overflow-hidden border border-gray-700/50">
            <div className="p-4">
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>
                        {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {renderStatusBadge()}
                        {assignment.post.expiresAt && <CountdownTimer targetDate={assignment.post.expiresAt} prefix="Expira em: " />}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-gray-700/50">
                <div className="space-y-4">
                     {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                        <div><StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} controls={assignment.post.type === 'video'} className="w-full h-auto object-contain rounded-md bg-dark" />
                            <div className="flex justify-center gap-4 mt-2">
                                {assignment.post.mediaUrl && <button onClick={handleFirebaseDownload} disabled={isMediaProcessing} className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md text-xs font-semibold hover:bg-gray-500"><DownloadIcon className="w-4 h-4"/>Link 1</button>}
                                {assignment.post.googleDriveUrl && <button onClick={handleGoogleDriveDownload} className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-500"><DownloadIcon className="w-4 h-4"/>Link 2</button>}
                            </div>
                        </div>
                    )}
                    {assignment.post.type === 'text' && <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm bg-gray-800 p-3 rounded-md">{assignment.post.textContent}</pre>}
                </div>
                <div className="space-y-4">
                    <div><h4 className="font-semibold text-gray-200 text-sm mb-1">Instruções:</h4><div className="bg-gray-800/50 p-3 rounded-md text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</div></div>
                    {assignment.post.postLink && <div><h4 className="font-semibold text-gray-200 text-sm mb-1">Link para Postagem:</h4><div className="bg-gray-800/50 p-2 rounded-md flex items-center gap-2"><input type="text" readOnly value={assignment.post.postLink} className="flex-grow w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-xs"/><button onClick={handleCopyLink} className="flex-shrink-0 px-2 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-xs w-20">{linkCopied ? 'Copiado!' : 'Copiar'}</button><a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-xs"><ExternalLinkIcon className="w-4 h-4"/></a></div></div>}
                </div>
            </div>
            <div className="border-t border-gray-700/50">{renderActionFooter()}</div>
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

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setError(null); setAssignments([]); setScheduledPosts([]); setSearched(true);
        try {
            const [promoterProfiles, fetchedAssignments, fetchedScheduled] = await Promise.all([findPromotersByEmail(searchEmail), getAssignmentsForPromoterByEmail(searchEmail), getScheduledPostsForPromoter(searchEmail)]);
            if (promoterProfiles.length === 0) { setError("Nenhum cadastro encontrado com este e-mail."); setIsLoading(false); return; }
            setPromoter(promoterProfiles[0]);
            const assignmentsWithGroupStatus = fetchedAssignments.map(assignment => { const promoterProfile = promoterProfiles.find(p => p.id === assignment.promoterId); return { ...assignment, promoterHasJoinedGroup: promoterProfile?.hasJoinedGroup || false }; });
            setAssignments(assignmentsWithGroupStatus); setScheduledPosts(fetchedScheduled);
        } catch (err: any) { setError(err.message || 'Ocorreu um erro ao buscar.'); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { const queryParams = new URLSearchParams(location.search); const emailFromQuery = queryParams.get('email'); if (emailFromQuery) { setEmail(emailFromQuery); performSearch(emailFromQuery); } }, [location.search, performSearch]);
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); navigate(`/posts?email=${encodeURIComponent(email)}`); };
    const handleConfirmAssignment = async (assignment: PostAssignment) => { try { await confirmAssignment(assignment.id); performSearch(email); } catch (err: any) { alert(err.message); } };
    const handleReminderRequested = () => { setAssignments(prev => prev.map(a => ({ ...a, whatsAppReminderRequestedAt: firebase.firestore.Timestamp.now() }))); alert("Lembrete agendado com sucesso para daqui a 6 horas!"); };
    const handleOpenJustification = (assignment: PostAssignment) => { setJustificationAssignment(assignment); setJustificationText(''); setJustificationFiles([]); };
    const handleJustificationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setJustificationFiles(Array.from(e.target.files)); };
    const handleSubmitJustification = async () => { if (!justificationAssignment || !justificationText.trim()) return; setIsSubmittingJustification(true); try { await submitJustification(justificationAssignment.id, justificationText, justificationFiles); setJustificationAssignment(null); performSearch(email); } catch (err: any) { alert(err.message); } finally { setIsSubmittingJustification(false); } };

    const pendingAssignments = assignments.filter(a => !isHistoryAssignment(a));
    const historyAssignments = assignments.filter(a => isHistoryAssignment(a));

    const renderContent = () => {
        if (!searched) return null;
        if (isLoading) return <div className="flex justify-center items-center py-10"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>;
        if (error) return <p className="text-red-400 mt-4 text-center">{error}</p>;
        
        return (
            <div className="mt-8">
                <div className="mb-6 border-b border-gray-700">
                    <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                        <button onClick={() => setActiveTab('pending')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'pending' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>Pendentes ({pendingAssignments.length})</button>
                        <button onClick={() => setActiveTab('scheduled')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'scheduled' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>Agendadas ({scheduledPosts.length})</button>
                        <button onClick={() => setActiveTab('history')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>Histórico ({historyAssignments.length})</button>
                    </nav>
                </div>

                <div className="space-y-6">
                    {activeTab === 'pending' && (pendingAssignments.length > 0 ? pendingAssignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} onReminderRequested={handleReminderRequested} />) : <p className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">Nenhuma tarefa pendente! 🎉</p>)}
                    {activeTab === 'scheduled' && (scheduledPosts.length > 0 ? scheduledPosts.map(p => (<div key={p.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between"><p className="font-semibold text-white">{p.postData.campaignName}</p><span className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-500/30">Agendado</span></div>)) : <p className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">Nenhuma publicação agendada.</p>)}
                    {activeTab === 'history' && (historyAssignments.length > 0 ? historyAssignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={()=>{}} onJustify={()=>{}} onReminderRequested={()=>{}} />) : <p className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">Seu histórico está vazio.</p>)}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-3xl mx-auto">
            {!searched || !promoter ? (
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                    <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver suas tarefas.</p>
                    <form onSubmit={handleSubmit}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" required /><button type="submit" disabled={isLoading} className="mt-4 w-full py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">{isLoading ? 'Buscando...' : 'Ver Tarefas'}</button></form>
                </div>
            ) : (
                <div className="flex justify-between items-center mb-6">
                     <div>
                        <h1 className="text-2xl font-bold text-white">Olá, {promoter.name.split(' ')[0]}!</h1>
                        <p className="text-gray-400">Aqui estão suas tarefas de divulgação.</p>
                    </div>
                    <button onClick={() => setIsStatsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 font-semibold"><ChartBarIcon className="w-5 h-5"/> Minhas Stats</button>
                </div>
            )}
            
            {renderContent()}

            {justificationAssignment && (<div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4"><div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md"><h3 className="text-xl font-bold text-white mb-4">Justificar Ausência</h3><p className="text-gray-300 text-sm mb-4">Explique por que não pôde realizar a publicação ({justificationAssignment.post.campaignName}).</p><textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Motivo..." rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 mb-4" /><div className="mb-4"><label className="block text-sm font-medium text-gray-300 mb-1">Anexar Print/Foto (Opcional)</label><input type="file" onChange={handleJustificationFileChange} multiple accept="image/*" className="text-sm text-gray-400" /></div><div className="flex justify-end gap-2"><button onClick={() => setJustificationAssignment(null)} className="px-4 py-2 bg-gray-600 text-white rounded-md">Cancelar</button><button onClick={handleSubmitJustification} disabled={isSubmittingJustification} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">{isSubmittingJustification ? 'Enviando...' : 'Enviar'}</button></div></div></div>)}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
