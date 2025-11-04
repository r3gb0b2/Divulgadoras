
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGuestListForCampaign, checkInPerson, checkOutPerson, getActiveGuestListsForCampaign, unlockGuestListConfirmation } from '../services/guestListService';
import { getPromotersByIds } from '../services/promoterService';
import { GuestListConfirmation, Promoter, GuestList, Campaign, Timestamp, FieldValue } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon, UsersIcon, ClockIcon } from '../components/Icons';
import { getAllCampaigns } from '../services/settingsService';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

type ConfirmationWithDetails = GuestListConfirmation & { promoterPhotoUrl?: string };
type Person = {
    name: string;
    isPromoter: boolean;
    confirmationId: string;
    checkedInAt: Timestamp | FieldValue | null | undefined;
    checkedOutAt: Timestamp | FieldValue | null | undefined;
    photoUrl?: string;
    listName: string;
    promoterName: string;
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
// FIX: The playSound function was incomplete, causing a syntax error.
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);
    }

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
};

const GuestListCheckinPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const [allPeople, setAllPeople] = useState<Person[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const fetchData = useCallback(async () => {
        if (!campaignId) {
            setError("ID do evento não fornecido.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const confirmations = await getGuestListForCampaign(campaignId);
            const promoterIds = [...new Set(confirmations.map(c => c.promoterId))];
            const promoters = promoterIds.length > 0 ? await getPromotersByIds(promoterIds) : [];
            const promoterPhotoMap = new Map(promoters.map(p => [p.id, p.photoUrls[0]]));

            const peopleList: Person[] = [];
            confirmations.forEach(conf => {
                if (conf.isPromoterAttending) {
                    peopleList.push({
                        name: conf.promoterName,
                        isPromoter: true,
                        confirmationId: conf.id,
                        checkedInAt: conf.promoterCheckedInAt,
                        checkedOutAt: conf.promoterCheckedOutAt,
                        photoUrl: promoterPhotoMap.get(conf.promoterId),
                        listName: conf.listName,
                        promoterName: conf.promoterName,
                    });
                }
                conf.guestNames.forEach(guestName => {
                    if (guestName.trim()) {
                        const checkedInData = conf.guestsCheckedIn?.find(g => g.name === guestName);
                        peopleList.push({
                            name: guestName,
                            isPromoter: false,
                            confirmationId: conf.id,
                            checkedInAt: checkedInData?.checkedInAt,
                            checkedOutAt: checkedInData?.checkedOutAt,
                            photoUrl: undefined,
                            listName: conf.listName,
                            promoterName: conf.promoterName,
                        });
                    }
                });
            });

            setAllPeople(peopleList.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar lista de check-in.');
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        fetchData();
        searchInputRef.current?.focus();
    }, [fetchData]);

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        playSound(type);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleCheckIn = async (person: Person) => {
        try {
            await checkInPerson(person.confirmationId, person.name);
            showFeedback('success', `${person.name} - ENTRADA LIBERADA`);
            await fetchData();
            setSearchQuery('');
        } catch (err: any) {
            showFeedback('error', err.message || 'Falha no check-in.');
        }
    };

    const handleCheckOut = async (person: Person) => {
        try {
            await checkOutPerson(person.confirmationId, person.name);
            showFeedback('success', `${person.name} - SAÍDA REGISTRADA`);
            await fetchData();
            setSearchQuery('');
        } catch (err: any) {
            showFeedback('error', err.message || 'Falha no check-out.');
        }
    };

    const filteredPeople = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const lowerQuery = searchQuery.toLowerCase();
        return allPeople.filter(p => p.name.toLowerCase().includes(lowerQuery));
    }, [allPeople, searchQuery]);

    const stats = useMemo(() => {
        const checkedIn = allPeople.filter(p => p.checkedInAt && !p.checkedOutAt).length;
        return { total: allPeople.length, checkedIn };
    }, [allPeople]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Controle de Entrada</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-dark p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Total na Lista</h3><p className="text-3xl font-bold text-white">{stats.total}</p></div>
                    <div className="bg-dark p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Presentes Agora</h3><p className="text-3xl font-bold text-green-400">{stats.checkedIn}</p></div>
                </div>
                {feedback && (
                    <div className={`p-4 mb-4 rounded-lg text-center text-xl font-bold ${feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        {feedback.message}
                    </div>
                )}
                <div className="relative mb-4">
                    <SearchIcon className="w-6 h-6 text-gray-400 absolute top-1/2 left-4 -translate-y-1/2" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Buscar nome na lista..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-14 pr-4 py-4 text-lg border border-gray-600 rounded-md bg-gray-800 text-white focus:ring-primary focus:border-primary"
                    />
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredPeople.map((person, index) => (
                        <div key={`${person.confirmationId}-${person.name}-${index}`} className="bg-dark/70 p-3 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                {person.photoUrl && <img src={person.photoUrl} alt={person.name} className="w-12 h-12 object-cover rounded-full" />}
                                <div>
                                    <p className="font-semibold text-lg text-white">{person.name}</p>
                                    <p className="text-xs text-gray-400">Lista: {person.listName} (de {person.promoterName})</p>
                                </div>
                            </div>
                            <div className="flex-shrink-0 flex gap-2">
                                {person.checkedInAt && !person.checkedOutAt ? (
                                    <>
                                        <span className="flex items-center gap-1 text-green-400 text-sm"><CheckCircleIcon className="w-4 h-4" /> Entrou</span>
                                        <button onClick={() => handleCheckOut(person)} className="px-3 py-1 bg-yellow-600 text-white text-sm font-semibold rounded-md">Saída</button>
                                    </>
                                ) : person.checkedInAt && person.checkedOutAt ? (
                                    <span className="text-gray-500 text-sm">Saiu</span>
                                ) : (
                                    <button onClick={() => handleCheckIn(person)} className="px-3 py-1 bg-primary text-white text-sm font-semibold rounded-md">Entrada</button>
                                )}
                            </div>
                        </div>
                    ))}
                    {searchQuery && filteredPeople.length === 0 && <p className="text-center text-gray-400 py-4">Nenhum resultado encontrado.</p>}
                </div>
            </div>
        </div>
    );
};

export default GuestListCheckinPage;
