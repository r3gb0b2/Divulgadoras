
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGuestListForCampaign, checkInPerson, checkOutPerson } from '../services/guestListService';
import { getPromotersByIds } from '../services/promoterService';
import { GuestListConfirmation, Promoter, Campaign, Timestamp } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon, UsersIcon, ClockIcon } from '../components/Icons';
import { getAllCampaigns } from '../services/settingsService';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// Audio Helper
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

interface CheckinItem {
    id: string; // unique key (confirmationId + name)
    confirmationId: string;
    name: string;
    type: 'Promoter' | 'Guest';
    listName: string;
    promoterName: string;
    checkedInAt: Date | null;
    checkedOutAt: Date | null;
    photoUrl?: string;
    isPromoterAttending?: boolean;
}

const GuestListCheckinPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();

    const [items, setItems] = useState<CheckinItem[]>([]);
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!campaignId) return;
        setIsLoading(true);
        setError(null);
        try {
            const confirmations = await getGuestListForCampaign(campaignId);
            
            let orgId: string | undefined;
            if (confirmations.length > 0) {
                orgId = confirmations[0].organizationId;
            }
            
            if (orgId) {
                const allCampaigns = await getAllCampaigns(orgId);
                const foundCampaign = allCampaigns.find(c => c.id === campaignId);
                if (foundCampaign) setCampaign(foundCampaign);
            }

            // Fetch promoter photos
            const promoterIds = [...new Set(confirmations.map(c => c.promoterId))];
            const promoters = await getPromotersByIds(promoterIds);
            const promoterMap = new Map(promoters.map(p => [p.id, p]));

            const flatList: CheckinItem[] = [];

            confirmations.forEach(conf => {
                // Add Promoter
                const promoterData = promoterMap.get(conf.promoterId);
                flatList.push({
                    id: `${conf.id}_promoter`,
                    confirmationId: conf.id,
                    name: conf.promoterName,
                    type: 'Promoter',
                    listName: conf.listName,
                    promoterName: conf.promoterName,
                    checkedInAt: conf.promoterCheckedInAt ? (conf.promoterCheckedInAt as Timestamp).toDate() : null,
                    checkedOutAt: conf.promoterCheckedOutAt ? (conf.promoterCheckedOutAt as Timestamp).toDate() : null,
                    photoUrl: promoterData?.photoUrls?.[0],
                    isPromoterAttending: conf.isPromoterAttending
                });

                // Add Guests
                (conf.guestNames || []).forEach((guestName, idx) => {
                    if (!guestName.trim()) return;
                    
                    // Find guest checkin status
                    const guestCheckinRecord = conf.guestsCheckedIn?.find(g => g.name === guestName && !g.checkedOutAt); // Active checkin
                    const guestHistoryRecord = conf.guestsCheckedIn?.find(g => g.name === guestName && g.checkedOutAt); // Past checkin
                    
                    // Prioritize active checkin record
                    const record = guestCheckinRecord || guestHistoryRecord;

                    flatList.push({
                        id: `${conf.id}_guest_${idx}`,
                        confirmationId: conf.id,
                        name: guestName,
                        type: 'Guest',
                        listName: conf.listName,
                        promoterName: conf.promoterName,
                        checkedInAt: record ? (record.checkedInAt as Timestamp).toDate() : null,
                        checkedOutAt: record?.checkedOutAt ? (record.checkedOutAt as Timestamp).toDate() : null,
                    });
                });
            });

            // Sort alphabetically
            flatList.sort((a, b) => a.name.localeCompare(b.name));
            setItems(flatList);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCheckIn = async (item: CheckinItem) => {
        setProcessingId(item.id);
        try {
            await checkInPerson(item.confirmationId, item.name);
            playSound('success');
            await fetchData();
        } catch (err: any) {
            alert(err.message);
            playSound('error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleCheckOut = async (item: CheckinItem) => {
        if (!window.confirm(`Confirmar saída de ${item.name}?`)) return;
        setProcessingId(item.id);
        try {
            await checkOutPerson(item.confirmationId, item.name);
            await fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const filteredItems = useMemo(() => {
        let result = items;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(i => 
                i.name.toLowerCase().includes(q) || 
                i.promoterName.toLowerCase().includes(q) ||
                i.listName.toLowerCase().includes(q)
            );
        }

        if (filter === 'present') {
            result = result.filter(i => i.checkedInAt && !i.checkedOutAt);
        } else if (filter === 'absent') {
            result = result.filter(i => !i.checkedInAt || i.checkedOutAt);
        }
        
        // Filter out promoters who said they aren't coming, unless they checked in anyway
        return result.filter(i => i.type === 'Guest' || i.isPromoterAttending || i.checkedInAt);

    }, [items, searchQuery, filter]);

    const stats = useMemo(() => {
        const total = filteredItems.length;
        const checkedIn = filteredItems.filter(i => i.checkedInAt && !i.checkedOutAt).length;
        return { total, checkedIn };
    }, [filteredItems]);

    return (
        <div className="pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-secondary p-4 rounded-lg shadow-lg sticky top-0 z-10">
                <div className="flex items-center gap-2">
                     <button onClick={() => navigate(-1)} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600">
                        <ArrowLeftIcon className="w-5 h-5 text-white" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-white leading-tight">{campaign?.name || 'Check-in'}</h1>
                        <p className="text-sm text-gray-400">{stats.checkedIn} / {stats.total} presentes</p>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                     <button onClick={() => navigate(`/admin/checkin/scanner`)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-semibold">
                        <CheckCircleIcon className="w-5 h-5" />
                        <span>Scanner</span>
                    </button>
                </div>
            </div>

            <div className="bg-secondary p-4 rounded-lg shadow-lg mb-6">
                 <div className="relative mb-4">
                    <SearchIcon className="w-5 h-5 text-gray-400 absolute top-1/2 left-3 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Buscar nome, divulgadora ou lista..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-dark rounded-lg border border-gray-600 focus:ring-primary focus:border-primary text-white"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300'}`}>Todos</button>
                    <button onClick={() => setFilter('present')} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'present' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Presentes</button>
                    <button onClick={() => setFilter('absent')} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'absent' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Ausentes</button>
                </div>
            </div>

            {isLoading ? (
                 <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : error ? (
                <p className="text-red-400 text-center">{error}</p>
            ) : (
                <div className="space-y-3">
                    {filteredItems.map(item => {
                        const isCheckedIn = item.checkedInAt && !item.checkedOutAt;
                        return (
                            <div key={item.id} className={`bg-secondary p-4 rounded-lg shadow border-l-4 ${isCheckedIn ? 'border-green-500' : 'border-gray-600'} flex items-center justify-between`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {item.type === 'Promoter' && item.photoUrl ? (
                                        <img src={item.photoUrl} alt={item.name} className="w-12 h-12 rounded-full object-cover border-2 border-gray-600" />
                                    ) : (
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${item.type === 'Promoter' ? 'bg-purple-600' : 'bg-blue-600'}`}>
                                            {item.type === 'Promoter' ? 'P' : 'C'}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="font-bold text-white text-lg truncate">{item.name}</p>
                                        <div className="text-xs text-gray-400 flex flex-wrap gap-2">
                                            <span className="bg-gray-700 px-2 py-0.5 rounded">{item.listName}</span>
                                            {item.type === 'Guest' && <span>via {item.promoterName}</span>}
                                        </div>
                                        {item.checkedInAt && (
                                            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                                                <ClockIcon className="w-3 h-3" />
                                                Entrou às {item.checkedInAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex-shrink-0 pl-2">
                                    {isCheckedIn ? (
                                        <button 
                                            onClick={() => handleCheckOut(item)}
                                            disabled={processingId === item.id}
                                            className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-900 rounded hover:bg-red-900/50 text-xs font-semibold"
                                        >
                                            {processingId === item.id ? '...' : 'Sair'}
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleCheckIn(item)}
                                            disabled={processingId === item.id}
                                            className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white hover:bg-green-500 shadow-lg active:scale-95 transition-transform"
                                        >
                                            {processingId === item.id ? (
                                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                            ) : (
                                                <CheckCircleIcon className="w-6 h-6" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filteredItems.length === 0 && <p className="text-center text-gray-400 py-8">Nenhuma pessoa encontrada.</p>}
                </div>
            )}
        </div>
    );
};

export default GuestListCheckinPage;
