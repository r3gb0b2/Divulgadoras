import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGuestListForCampaign, checkInPerson, getActiveGuestListsForCampaign } from '../services/guestListService';
import { getPromotersByIds } from '../services/promoterService';
import { GuestListConfirmation, Promoter, GuestList } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon, UsersIcon, ClockIcon, ChartBarIcon } from '../components/Icons';
// FIX: Imported FieldValue to resolve type error.
import { Timestamp, FieldValue } from 'firebase/firestore';
import Fuse from 'fuse.js';

type ConfirmationWithDetails = GuestListConfirmation & { promoterPhotoUrl?: string };
type Person = {
    name: string;
    isPromoter: boolean;
    confirmationId: string;
    checkedInAt: Timestamp | FieldValue | null | undefined;
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
        if (rowRef.current) {
            rowRef.current.style.transition = 'none';
        }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isSwiping.current || !enabled) return;
        const currentX = e.targetTouches[0].clientX;
        const diffX = currentX - touchStartX.current;
        if (diffX > 0 && rowRef.current) { // Only allow right swipe
            rowRef.current.style.transform = `translateX(${diffX}px)`;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isSwiping.current || !enabled) return;
        isSwiping.current = false;
        if (rowRef.current) {
            const currentTransform = new WebKitCSSMatrix(window.getComputedStyle(rowRef.current).transform).m41;
            rowRef.current.style.transition = 'transform 0.3s ease';
            if (currentTransform > 100) { // Swipe threshold
                onSwipeRight();
                // No need to reset transform here, as the component will re-render in a checked-in state
            } else {
                rowRef.current.style.transform = 'translateX(0px)';
            }
        }
    };

    return (
        <div className="relative bg-gray-800 rounded-lg overflow-hidden">
            <div className="absolute inset-y-0 left-0 flex items-center bg-green-600 px-6">
                <CheckCircleIcon className="w-8 h-8 text-white" />
            </div>
            <div
                ref={rowRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative z-10"
            >
                {children}
            </div>
        </div>
    );
};


const GuestListCheckinPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const [allConfirmations, setAllConfirmations] = useState<ConfirmationWithDetails[]>([]);
    const [availableLists, setAvailableLists] = useState<GuestList[]>([]);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingCheckin, setProcessingCheckin] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'checkedIn'>('pending');
    const [feedback, setFeedback] = useState<{ type: 'idle' | 'success' | 'error', key: number }>({ type: 'idle', key: 0 });

    // --- Modernization: High Contrast Mode ---
    useEffect(() => {
        document.documentElement.classList.add('bg-black');
        return () => document.documentElement.classList.remove('bg-black');
    }, []);

    // --- Feedback Effect ---
    useEffect(() => {
        if (feedback.type !== 'idle') {
            const timer = setTimeout(() => setFeedback(prev => ({ ...prev, type: 'idle' })), 400);
            return () => clearTimeout(timer);
        }
    }, [feedback]);


    const fetchData = useCallback(async () => {
        if (!campaignId) {
            setError("ID do evento não fornecido.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const [confirmations, lists] = await Promise.all([
                getGuestListForCampaign(campaignId),
                getActiveGuestListsForCampaign(campaignId)
            ]);
            
            setAvailableLists(lists);

            if (confirmations.length === 0) {
                setAllConfirmations([]);
            } else {
                const promoterIds = [...new Set(confirmations.map(c => c.promoterId))];
                const promoters = await getPromotersByIds(promoterIds);
                const promoterPhotoMap = new Map<string, string>();
                promoters.forEach(p => {
                    if (p.photoUrls && p.photoUrls.length > 0) {
                        promoterPhotoMap.set(p.id, p.photoUrls[0]);
                    }
                });

                const confirmationsWithDetails = confirmations.map(c => ({
                    ...c,
                    promoterPhotoUrl: promoterPhotoMap.get(c.promoterId)
                }));
                setAllConfirmations(confirmationsWithDetails);
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar a lista.');
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const listStats = useMemo(() => {
        if (!selectedListId) return { total: 0, checkedIn: 0, pending: 0, rate: 0 };
        const confirmationsForList = allConfirmations.filter(conf => conf.guestListId === selectedListId);
        let totalPeople = 0;
        let checkedInCount = 0;

        confirmationsForList.forEach(conf => {
            const guestList = conf.guestNames.filter(name => name.trim() !== '');
            if (conf.isPromoterAttending) {
                totalPeople++;
                if (conf.promoterCheckedInAt) checkedInCount++;
            }
            totalPeople += guestList.length;
            checkedInCount += (conf.guestsCheckedIn || []).length;
        });

        const pendingCount = totalPeople - checkedInCount;
        const rate = totalPeople > 0 ? Math.round((checkedInCount / totalPeople) * 100) : 0;
        return { total: totalPeople, checkedIn: checkedInCount, pending: pendingCount, rate: rate };
    }, [allConfirmations, selectedListId]);

    // --- Modernization: Fuzzy Search ---
    const allPeopleForFuse = useMemo(() => {
        if (!selectedListId) return [];
        const people: Person[] = [];
        allConfirmations
            .filter(conf => conf.guestListId === selectedListId)
            .forEach(conf => {
                if (conf.isPromoterAttending) {
                    people.push({
                        name: conf.promoterName,
                        isPromoter: true,
                        confirmationId: conf.id,
                        checkedInAt: conf.promoterCheckedInAt,
                    });
                }
                conf.guestNames.filter(name => name.trim()).forEach(guestName => {
                    people.push({
                        name: guestName,
                        isPromoter: false,
                        confirmationId: conf.id,
                        checkedInAt: (conf.guestsCheckedIn || []).find(g => g.name === guestName)?.checkedInAt,
                    });
                });
            });
        return people;
    }, [allConfirmations, selectedListId]);

    const fuse = useMemo(() => new Fuse(allPeopleForFuse, {
        keys: ['name'],
        threshold: 0.3, // Adjust for desired fuzziness
    }), [allPeopleForFuse]);

    const filteredPeople = useMemo(() => {
        let people = searchQuery.trim() ? fuse.search(searchQuery.trim()).map(result => result.item) : allPeopleForFuse;

        if (statusFilter !== 'all') {
            people = people.filter(p => statusFilter === 'checkedIn' ? !!p.checkedInAt : !p.checkedInAt);
        }
        return people;
    }, [searchQuery, allPeopleForFuse, statusFilter, fuse]);


    const handleCheckIn = async (confirmationId: string, personName: string) => {
        const checkinKey = `${confirmationId}-${personName}`;
        setProcessingCheckin(checkinKey);
        setError(null);
        try {
            await checkInPerson(confirmationId, personName);
            playSound('success');
            if (navigator.vibrate) navigator.vibrate(100);
            setFeedback({ type: 'success', key: Date.now() });

            setAllConfirmations(prev => prev.map(conf => {
                if (conf.id === confirmationId) {
                    const now = Timestamp.now();
                    const updatedConf = { ...conf };
                    if (personName === conf.promoterName) updatedConf.promoterCheckedInAt = now;
                    else updatedConf.guestsCheckedIn = [...(conf.guestsCheckedIn || []), { name: personName, checkedInAt: now }];
                    return updatedConf;
                }
                return conf;
            }));
        } catch (err: any) {
            setError(err.message || `Falha no check-in de ${personName}.`);
            playSound('error');
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setFeedback({ type: 'error', key: Date.now() });
        } finally {
            setProcessingCheckin(null);
        }
    };

    const formatTime = (timestamp: any): string => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return 'Inválido';
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const selectedListName = useMemo(() => availableLists.find(l => l.id === selectedListId)?.name || 'Lista', [selectedListId, availableLists]);

    // --- RENDER FUNCTIONS ---
    const renderListSelection = () => (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Selecione uma lista para o check-in</h2>
            {isLoading ? <div className="text-center py-8">Carregando listas...</div> : availableLists.length === 0 ? <p className="text-gray-400 text-center py-8">Nenhuma lista ativa para este evento.</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {availableLists.map(list => <button key={list.id} onClick={() => setSelectedListId(list.id)} className="bg-dark/70 p-6 rounded-lg text-left hover:bg-gray-800 transition-colors"><h3 className="font-bold text-2xl text-primary">{list.name}</h3></button>)}
                </div>
            )}
        </div>
    );
    
    const renderCheckinList = () => {
        if (isLoading) return <div className="flex justify-center items-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        if (filteredPeople.length === 0) return <p className="text-gray-400 text-center text-lg py-8">Nenhum nome encontrado.</p>;

        return (
            <div className="space-y-4">
                {filteredPeople.map(person => {
                    const checkinKey = `${person.confirmationId}-${person.name}`;
                    const isCheckedIn = !!person.checkedInAt;
                    return (
                        <SwipeableRow key={checkinKey} onSwipeRight={() => handleCheckIn(person.confirmationId, person.name)} enabled={!isCheckedIn && !processingCheckin}>
                            <div className="flex items-center justify-between p-4 bg-gray-900/80">
                                <span className={`text-xl font-medium ${isCheckedIn ? 'text-gray-500 line-through' : 'text-gray-100'}`}>{person.name}</span>
                                {isCheckedIn ? (
                                    <div className="flex items-center gap-2 text-lg font-semibold text-green-400">
                                        <CheckCircleIcon className="w-7 h-7" />
                                        <span>{formatTime(person.checkedInAt)}</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleCheckIn(person.confirmationId, person.name)}
                                        disabled={processingCheckin === checkinKey}
                                        className="px-5 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 text-lg"
                                    >
                                        {processingCheckin === checkinKey ? '...' : 'Check-in'}
                                    </button>
                                )}
                            </div>
                        </SwipeableRow>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-black text-gray-200 font-sans p-4">
             {feedback.type !== 'idle' && (
                <div key={feedback.key} className={`fixed inset-0 z-50 pointer-events-none animate-flash ${feedback.type === 'success' ? 'bg-green-500/80' : 'bg-red-500/80'}`}></div>
            )}
             <style>{`.animate-flash { animation: flash 0.4s ease-out; } @keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }`}</style>

            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <button onClick={() => selectedListId ? setSelectedListId(null) : navigate(-1)} className="inline-flex items-center gap-2 text-lg font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                            <ArrowLeftIcon className="w-6 h-6" />
                            <span>{selectedListId ? 'Voltar' : 'Sair'}</span>
                        </button>
                        <h1 className="text-4xl font-bold mt-1">{selectedListId ? selectedListName : 'Controle de Entrada'}</h1>
                    </div>
                </div>
                <div className="bg-gray-900 shadow-lg rounded-lg p-6">
                    {selectedListId ? (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Total</h3><p className="text-4xl font-bold text-white">{listStats.total}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Check-ins</h3><p className="text-4xl font-bold text-green-400">{listStats.checkedIn}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Pendentes</h3><p className="text-4xl font-bold text-yellow-400">{listStats.pending}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400">Taxa</h3><p className="text-4xl font-bold text-primary">{listStats.rate}%</p></div>
                            </div>
                            <div className="space-y-6 mb-6">
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4"><SearchIcon className="h-6 w-6 text-gray-400" /></span>
                                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar nome..." className="w-full pl-14 pr-4 py-4 border-2 border-gray-600 rounded-lg bg-gray-800 text-gray-100 text-xl focus:ring-primary focus:border-primary" />
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                                    <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                                        {(['pending', 'checkedIn', 'all'] as const).map(f => (
                                            <button key={f} onClick={() => setStatusFilter(f)} className={`px-5 py-2 text-base font-medium rounded-md transition-colors ${statusFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                                {{'pending': 'Pendentes', 'checkedIn': 'Feitos', 'all': 'Todos'}[f]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
                            {renderCheckinList()}
                        </>
                    ) : renderListSelection()}
                </div>
            </div>
        </div>
    );
};

export default GuestListCheckinPage;
