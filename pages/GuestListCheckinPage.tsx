import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGuestListForCampaign, checkInPerson, checkOutPerson, getActiveGuestListsForCampaign, unlockGuestListConfirmation } from '../services/guestListService';
import { getPromotersByIds } from '../services/promoterService';
import { GuestListConfirmation, Promoter, GuestList, Campaign, Timestamp, FieldValue } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon, UsersIcon, ClockIcon, FaceIdIcon } from '../components/Icons';
import { getAllCampaigns } from '../services/settingsService';
// FIX: Import firebase to use Timestamp as a value.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

type ConfirmationWithDetails = GuestListConfirmation & { promoterDetails?: Promoter };
type Person = {
    name: string;
    isPromoter: boolean;
    confirmationId: string;
    checkedInAt: Timestamp | FieldValue | null | undefined;
    checkedOutAt: Timestamp | FieldValue | null | undefined;
    avatarUrl?: string;
    facePhotoUrl?: string;
    listName: string;
    promoterName: string;
};

// --- Facial Verification Modal ---
const FacialVerificationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    promoterName: string;
    registeredPhotoUrl: string;
    isProcessing: boolean;
}> = ({ isOpen, onClose, onConfirm, promoterName, registeredPhotoUrl, isProcessing }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    useEffect(() => {
        const startCamera = async () => {
            if (isOpen) {
                try {
                    setCameraError(null);
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Camera error:", err);
                    setCameraError("Não foi possível acessar a câmera. Verifique as permissões.");
                }
            }
        };
        startCamera();
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">Validação Facial: <span className="text-primary">{promoterName}</span></h2>
                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
                    <div className="flex flex-col items-center">
                        <h3 className="font-semibold mb-2">Foto Cadastrada</h3>
                        <div className="w-full aspect-square bg-dark rounded-lg flex items-center justify-center">
                            <img src={registeredPhotoUrl} alt="Foto cadastrada" className="max-w-full max-h-full object-contain rounded-md" />
                        </div>
                    </div>
                     <div className="flex flex-col items-center">
                        <h3 className="font-semibold mb-2">Câmera ao Vivo</h3>
                        <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center">
                            {cameraError ? (
                                <p className="text-red-400 text-center p-4">{cameraError}</p>
                            ) : (
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover rounded-md transform -scale-x-100"></video>
                            )}
                        </div>
                    </div>
                </div>
                 <div className="mt-6 flex flex-col sm:flex-row justify-end gap-4 border-t border-gray-700 pt-4">
                    <button onClick={onClose} disabled={isProcessing} className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={onConfirm} disabled={isProcessing} className="px-8 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 text-lg disabled:opacity-50">
                        {isProcessing ? 'Confirmando...' : 'Confirmar Check-in'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Áudio Feedback Helper ---
const playSound = (type: 'success' | 'error') => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);
    } else {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);
    }
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
};


// --- Swipeable Row Component ---
const SwipeableRow: React.FC<{
    children: React.ReactNode;
    onSwipeRight: () => void;
    enabled: boolean;
}> = ({ children, onSwipeRight, enabled }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef(0);
    const isSwiping = useRef(false);

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!enabled) return;
        touchStartX.current = e.targetTouches[0].clientX;
        isSwiping.current = true;
        if (rowRef.current) rowRef.current.style.transition = 'none';
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isSwiping.current || !enabled) return;
        const currentX = e.targetTouches[0].clientX;
        const diffX = currentX - touchStartX.current;
        if (diffX > 0 && rowRef.current) rowRef.current.style.transform = `translateX(${diffX}px)`;
    };

    const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isSwiping.current || !enabled) return;
        isSwiping.current = false;
        if (rowRef.current) {
            const currentTransform = new WebKitCSSMatrix(window.getComputedStyle(rowRef.current).transform).m41;
            rowRef.current.style.transition = 'transform 0.3s ease';
            if (currentTransform > 100) onSwipeRight();
            else rowRef.current.style.transform = 'translateX(0px)';
        }
    };

    return (
        <div className="relative bg-gray-800 rounded-lg overflow-hidden">
            <div className="absolute inset-y-0 left-0 flex items-center bg-green-600 px-6">
                <CheckCircleIcon className="w-8 h-8 text-white" />
            </div>
            <div ref={rowRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="relative z-10">{children}</div>
        </div>
    );
};

const PhotoModal: React.FC<{ imageUrl: string | null; onClose: () => void }> = ({ imageUrl, onClose }) => {
    if (!imageUrl) return null;
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose} role="dialog">
            <div className="bg-secondary rounded-lg shadow-xl p-4 w-full max-w-sm relative" onClick={(e) => e.stopPropagation()}>
                <img src={imageUrl} alt="Foto da divulgadora" className="w-full h-auto object-contain rounded-md" />
                <button onClick={onClose} className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold hover:bg-red-700" aria-label="Fechar">&times;</button>
            </div>
        </div>
    );
};


const formatTime = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Inválido';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const PersonRow: React.FC<{ 
    person: Person;
    onCheckIn: (person: Person) => void;
    onCheckOut: (confirmationId: string, personName: string) => void;
    onUnlock: (confirmationId: string) => void;
    isLocked: boolean;
    processingCheckin: string | null;
    unlockingId: string | null;
    openPhotoModal: (url: string) => void;
}> = ({ person, onCheckIn, onCheckOut, onUnlock, isLocked, processingCheckin, unlockingId, openPhotoModal }) => {
    const checkinKey = `${person.confirmationId}-${person.name}`;
    const isCheckedIn = !!person.checkedInAt;
    const isCheckedOut = !!person.checkedOutAt;
    
    return (
        <SwipeableRow onSwipeRight={() => onCheckIn(person)} enabled={!isCheckedIn && !processingCheckin}>
            <div className="flex items-center justify-between p-4 bg-gray-800">
                <div className="flex items-center gap-4">
                    {person.isPromoter && person.avatarUrl ? (
                        <button onClick={() => openPhotoModal(person.avatarUrl!)} className="focus:outline-none rounded-full">
                            <img src={person.avatarUrl} alt={person.name} className="w-12 h-12 object-cover rounded-full flex-shrink-0" />
                        </button>
                    ) : (
                        <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0"><UsersIcon className="w-6 h-6 text-gray-400" /></div>
                    )}
                    <div>
                        <span className={`text-lg font-medium ${isCheckedIn ? 'text-gray-500 line-through' : 'text-gray-100'}`}>{person.name}</span>
                        <div className="text-xs text-gray-400">
                            <span>{person.listName}</span>
                            {!person.isPromoter && <span title={`Adicionado por ${person.promoterName}`}> • via {person.promoterName}</span>}
                        </div>
                    </div>
                </div>
                 {isCheckedOut ? (
                    <div className="text-sm text-gray-400 text-right">
                        <span className="block">Entrada: {formatTime(person.checkedInAt)}</span>
                        <span className="block">Saída: {formatTime(person.checkedOutAt)}</span>
                    </div>
                 ) : isCheckedIn ? (
                    <div className="flex items-center gap-2">
                        <span className="text-md font-semibold text-green-400">{formatTime(person.checkedInAt)}</span>
                        <button onClick={() => onCheckOut(person.confirmationId, person.name)} disabled={processingCheckin === checkinKey} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:opacity-50 text-md">
                           {processingCheckin === checkinKey ? '...' : 'Saída'}
                       </button>
                   </div>
                 ) : (
                     <div className="flex items-center gap-2">
                        {isLocked && person.isPromoter && (
                            <button onClick={() => onUnlock(person.confirmationId)} disabled={unlockingId === person.confirmationId} className="px-2 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-50" title="Liberar lista para edição">
                                {unlockingId === person.confirmationId ? '...' : 'Liberar'}
                            </button>
                        )}
                        <button onClick={() => onCheckIn(person)} disabled={processingCheckin === checkinKey} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 text-md">
                            {processingCheckin === checkinKey ? '...' : 'Check-in'}
                        </button>
                    </div>
                )}
            </div>
        </SwipeableRow>
    );
};


const GuestListCheckinPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const [allConfirmations, setAllConfirmations] = useState<ConfirmationWithDetails[]>([]);
    const [campaignName, setCampaignName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingCheckin, setProcessingCheckin] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'checkedIn'>('pending');
    const [feedback, setFeedback] = useState<{ type: 'idle' | 'success' | 'error', key: number }>({ type: 'idle', key: 0 });
    const [unlockingId, setUnlockingId] = useState<string | null>(null);
    const [verifyingPerson, setVerifyingPerson] = useState<Person | null>(null);

    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);

    const openPhotoModal = (url: string) => { setPhotoModalUrl(url); setIsPhotoModalOpen(true); };
    const closePhotoModal = () => { setIsPhotoModalOpen(false); setPhotoModalUrl(null); };

    useEffect(() => { document.documentElement.classList.add('bg-black'); return () => document.documentElement.classList.remove('bg-black'); }, []);
    useEffect(() => { if (feedback.type !== 'idle') { const timer = setTimeout(() => setFeedback(prev => ({ ...prev, type: 'idle' })), 400); return () => clearTimeout(timer); } }, [feedback]);

    const fetchData = useCallback(async () => {
        if (!campaignId) { setError("ID do evento não fornecido."); setIsLoading(false); return; }
        setIsLoading(true); setError(null);
        try {
            const [confirmations, activeLists, allCampaigns] = await Promise.all([ getGuestListForCampaign(campaignId), getActiveGuestListsForCampaign(campaignId), getAllCampaigns() ]);
            const camp = allCampaigns.find(c => c.id === campaignId);
            setCampaignName(camp?.name || 'Evento');
            const activeListIds = new Set(activeLists.map(l => l.id));
            const filteredConfirmations = confirmations.filter(c => c.guestListId && activeListIds.has(c.guestListId));

            if (filteredConfirmations.length === 0) {
                setAllConfirmations([]);
            } else {
                const promoterIds = [...new Set(filteredConfirmations.map(c => c.promoterId))];
                const promoters = await getPromotersByIds(promoterIds);
                const promoterDetailsMap = new Map<string, Promoter>(promoters.map(p => [p.id, p]));
                const confirmationsWithDetails = filteredConfirmations.map(c => ({...c, promoterDetails: promoterDetailsMap.get(c.promoterId)}));
                setAllConfirmations(confirmationsWithDetails);
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar a lista.');
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    
    const handleUnlock = async (confirmationId: string) => {
        setUnlockingId(confirmationId); setError(null);
        try {
            await unlockGuestListConfirmation(confirmationId);
            setAllConfirmations(prev => prev.map(conf => conf.id === confirmationId ? { ...conf, isLocked: false } : conf));
        } catch (err: any) {
            setError(err.message || 'Falha ao liberar para edição.');
        } finally {
            setUnlockingId(null);
        }
    };

    const allPeople = useMemo(() => {
        const people: Person[] = [];
        allConfirmations.forEach(conf => {
            if (conf.isPromoterAttending) {
                people.push({
                    name: conf.promoterName, isPromoter: true, confirmationId: conf.id,
                    checkedInAt: conf.promoterCheckedInAt, checkedOutAt: conf.promoterCheckedOutAt,
                    avatarUrl: conf.promoterDetails?.photoUrls?.[0], facePhotoUrl: conf.promoterDetails?.facePhotoUrl,
                    listName: conf.listName, promoterName: conf.promoterName
                });
            }
            conf.guestNames.filter(name => name.trim()).forEach(guestName => {
                 const guestCheckinData = (conf.guestsCheckedIn || []).find(g => g.name === guestName);
                people.push({
                    name: guestName, isPromoter: false, confirmationId: conf.id,
                    checkedInAt: guestCheckinData?.checkedInAt, checkedOutAt: guestCheckinData?.checkedOutAt,
                    avatarUrl: undefined, facePhotoUrl: undefined,
                    listName: conf.listName, promoterName: conf.promoterName
                });
            });
        });
        return people.sort((a, b) => a.name.localeCompare(b.name));
    }, [allConfirmations]);

    const listStats = useMemo(() => {
        const total = allPeople.length;
        const checkedIn = allPeople.filter(p => p.checkedInAt && !p.checkedOutAt).length;
        const pending = total - allPeople.filter(p => p.checkedInAt).length;
        const rate = total > 0 ? Math.round((allPeople.filter(p => p.checkedInAt).length / total) * 100) : 0;
        return { total, checkedIn, pending, rate };
    }, [allPeople]);

    const filteredPeople = useMemo(() => {
        let results = allPeople;
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            results = results.filter(p => p.name.toLowerCase().includes(lowerQuery) || p.promoterName.toLowerCase().includes(lowerQuery));
        }
        if (statusFilter !== 'all') {
            results = results.filter(p => {
                const isCheckedIn = !!p.checkedInAt;
                if (statusFilter === 'checkedIn') return isCheckedIn;
                if (statusFilter === 'pending') return !isCheckedIn;
                return true;
            });
        }
        return results;
    }, [allPeople, searchQuery, statusFilter]);

    const handleConfirmCheckin = async (confirmationId: string, personName: string) => {
        const checkinKey = `${confirmationId}-${personName}`;
        setProcessingCheckin(checkinKey); setError(null);
        try {
            await checkInPerson(confirmationId, personName);
            playSound('success');
            if (navigator.vibrate) navigator.vibrate(100);
            setFeedback({ type: 'success', key: Date.now() });

            setAllConfirmations(prev => prev.map(conf => {
                if (conf.id === confirmationId) {
                    const now = firebase.firestore.Timestamp.now();
                    const updatedConf = { ...conf };
                    if (personName === conf.promoterName) {
                        updatedConf.promoterCheckedInAt = now; updatedConf.promoterCheckedOutAt = null;
                    } else {
                         const guestIndex = (updatedConf.guestsCheckedIn || []).findIndex(g => g.name === personName);
                         if (guestIndex > -1) updatedConf.guestsCheckedIn![guestIndex] = { ...updatedConf.guestsCheckedIn![guestIndex], checkedInAt: now, checkedOutAt: null };
                         else updatedConf.guestsCheckedIn = [...(conf.guestsCheckedIn || []), { name: personName, checkedInAt: now, checkedOutAt: null }];
                    }
                    return updatedConf;
                }
                return conf;
            }));
        } catch (err: any) {
            setError(err.message || `Falha no check-in de ${personName}.`);
            playSound('error'); if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setFeedback({ type: 'error', key: Date.now() });
        } finally {
            setProcessingCheckin(null);
        }
    };
    
    const handleCheckInAttempt = (person: Person) => {
        if (person.isPromoter && person.facePhotoUrl) {
            setVerifyingPerson(person);
        } else {
            handleConfirmCheckin(person.confirmationId, person.name);
        }
    };
    
    const handleCheckOut = async (confirmationId: string, personName: string) => {
        const checkinKey = `${confirmationId}-${personName}`;
        setProcessingCheckin(checkinKey); setError(null);
        try {
            await checkOutPerson(confirmationId, personName);
            playSound('success'); if (navigator.vibrate) navigator.vibrate(50);
            setAllConfirmations(prev => prev.map(conf => {
                if (conf.id === confirmationId) {
                    const now = firebase.firestore.Timestamp.now();
                    const updatedConf = { ...conf };
                    if (personName === conf.promoterName) updatedConf.promoterCheckedOutAt = now;
                    else updatedConf.guestsCheckedIn = (conf.guestsCheckedIn || []).map(g => g.name === personName ? { ...g, checkedOutAt: now } : g);
                    return updatedConf;
                }
                return conf;
            }));
        } catch (err: any) {
            setError(err.message || `Falha no check-out de ${personName}.`); playSound('error');
        } finally {
            setProcessingCheckin(null);
        }
    };

    const renderCheckinList = () => {
        if (isLoading) return <div className="flex justify-center items-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        if (error) return <p className="text-red-400 text-center mb-4">{error}</p>;
        if (allConfirmations.length === 0) return <p className="text-gray-400 text-center text-lg py-8">Nenhuma lista foi enviada para este evento ainda.</p>;
        if (filteredPeople.length === 0) return <p className="text-gray-400 text-center text-lg py-8">Nenhum nome encontrado.</p>;
        return <div className="space-y-2">{filteredPeople.map(person => {
            const confirmation = allConfirmations.find(c => c.id === person.confirmationId);
            return <PersonRow key={`${person.confirmationId}-${person.name}`} person={person} onCheckIn={handleCheckInAttempt} onCheckOut={handleCheckOut} onUnlock={handleUnlock} isLocked={confirmation?.isLocked ?? false} processingCheckin={processingCheckin} unlockingId={unlockingId} openPhotoModal={openPhotoModal} />;
        })}</div>;
    };

    return (
        <div className="min-h-screen bg-black text-gray-200 font-sans p-4">
             {feedback.type !== 'idle' && <div key={feedback.key} className={`fixed inset-0 z-50 pointer-events-none animate-flash ${feedback.type === 'success' ? 'bg-green-500/80' : 'bg-red-500/80'}`}></div>}
             <style>{`.animate-flash { animation: flash 0.4s ease-out; } @keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }`}</style>
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-lg font-medium text-primary hover:text-primary-dark transition-colors mb-2"><ArrowLeftIcon className="w-6 h-6" /><span>Voltar</span></button>
                        <h1 className="text-4xl font-bold mt-1">Check-in: {campaignName}</h1>
                    </div>
                </div>
                <div className="bg-gray-900 shadow-lg rounded-lg p-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Total</h3><p className="text-4xl font-bold text-white">{listStats.total}</p></div>
                        <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Presentes</h3><p className="text-4xl font-bold text-green-400">{listStats.checkedIn}</p></div>
                        <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Pendentes</h3><p className="text-4xl font-bold text-yellow-400">{listStats.pending}</p></div>
                        <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Taxa</h3><p className="text-4xl font-bold text-primary">{listStats.rate}%</p></div>
                    </div>
                    <div className="space-y-6 mb-6">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-4"><SearchIcon className="h-6 w-6 text-gray-400" /></span>
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar nome ou divulgadora..." className="w-full pl-14 pr-4 py-4 border-2 border-gray-600 rounded-lg bg-gray-800 text-gray-100 text-xl focus:ring-primary focus:border-primary" />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                            <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                                {(['pending', 'checkedIn', 'all'] as const).map(f => (<button key={f} onClick={() => setStatusFilter(f)} className={`px-5 py-2 text-base font-medium rounded-md transition-colors ${statusFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{{'pending': 'Pendentes', 'checkedIn': 'Check-in Realizado', 'all': 'Todos'}[f]}</button>))}
                            </div>
                        </div>
                    </div>
                    
                    {renderCheckinList()}
                </div>
            </div>
            <PhotoModal imageUrl={photoModalUrl} onClose={closePhotoModal} />
            <FacialVerificationModal
                isOpen={!!verifyingPerson}
                onClose={() => setVerifyingPerson(null)}
                onConfirm={() => {
                    if (verifyingPerson) {
                        handleConfirmCheckin(verifyingPerson.confirmationId, verifyingPerson.name);
                    }
                    setVerifyingPerson(null);
                }}
                promoterName={verifyingPerson?.name || ''}
                registeredPhotoUrl={verifyingPerson?.facePhotoUrl || ''}
                isProcessing={!!processingCheckin}
            />
        </div>
    );
};

export default GuestListCheckinPage;