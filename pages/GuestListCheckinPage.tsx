import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGuestListForCampaign, checkInPerson } from '../services/guestListService';
import { getPromotersByIds } from '../services/promoterService';
import { GuestListConfirmation, Promoter } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon } from '../components/Icons';
import firebase from '../firebase/config';

type ConfirmationWithDetails = GuestListConfirmation & { promoterPhotoUrl?: string };

const GuestListCheckinPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const [allConfirmations, setAllConfirmations] = useState<ConfirmationWithDetails[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingCheckin, setProcessingCheckin] = useState<string | null>(null); // Stores "confId-personName"

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
            if (confirmations.length === 0) {
                setAllConfirmations([]);
                setIsLoading(false);
                return;
            }

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
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar a lista.');
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredConfirmations = useMemo(() => {
        if (!searchQuery.trim()) {
            return allConfirmations;
        }
        const lowercasedQuery = searchQuery.toLowerCase();
        return allConfirmations.filter(conf =>
            conf.promoterName.toLowerCase().includes(lowercasedQuery) ||
            conf.guestNames.some(guest => guest.toLowerCase().includes(lowercasedQuery))
        );
    }, [searchQuery, allConfirmations]);

    const handleCheckIn = async (confirmationId: string, personName: string) => {
        const checkinKey = `${confirmationId}-${personName}`;
        setProcessingCheckin(checkinKey);
        setError(null);
        try {
            await checkInPerson(confirmationId, personName);
            // On success, refetch the data to get server timestamps
            await fetchData();
        } catch (err: any) {
            setError(err.message || `Falha no check-in de ${personName}.`);
            // No need to revert, fetchData will get the correct state
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

    const renderList = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            );
        }

        if (allConfirmations.length === 0 && !error) {
            return <p className="text-gray-400 text-center py-8">Nenhuma confirmação na lista para este evento.</p>;
        }

        if (filteredConfirmations.length === 0) {
            return <p className="text-gray-400 text-center py-8">Nenhum resultado encontrado para "{searchQuery}".</p>;
        }

        return (
            <div className="space-y-4">
                {filteredConfirmations.map(conf => {
                    const guestsCheckedInMap = new Map((conf.guestsCheckedIn || []).map(g => [g.name, g.checkedInAt]));
                    return (
                        <div key={conf.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
                            <div className="flex items-center gap-4 border-b border-gray-700 pb-3 mb-3">
                                <img
                                    src={conf.promoterPhotoUrl || 'https://via.placeholder.com/80'}
                                    alt={conf.promoterName}
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-primary"
                                />
                                <div className="flex-grow">
                                    <h3 className="text-lg sm:text-xl font-bold text-white">{conf.promoterName}</h3>
                                    <p className="text-sm text-primary font-semibold">{conf.listName}</p>
                                </div>
                                <div className="flex-shrink-0">
                                    {conf.promoterCheckedInAt ? (
                                        <div className="text-center">
                                            <CheckCircleIcon className="w-7 h-7 text-green-400 mx-auto" />
                                            <p className="text-xs font-bold text-green-300">{formatTime(conf.promoterCheckedInAt)}</p>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleCheckIn(conf.id, conf.promoterName)}
                                            disabled={processingCheckin === `${conf.id}-${conf.promoterName}`}
                                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {processingCheckin === `${conf.id}-${conf.promoterName}` ? '...' : 'Check-in'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {conf.guestNames.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Convidados:</h4>
                                    <ul className="space-y-2">
                                        {conf.guestNames.map(guestName => {
                                            const checkedInTime = guestsCheckedInMap.get(guestName);
                                            return (
                                                <li key={guestName} className="flex justify-between items-center bg-gray-800/50 p-2 rounded-md">
                                                    <span className="text-gray-200">{guestName}</span>
                                                    {checkedInTime ? (
                                                        <div className="flex items-center gap-2 text-xs font-semibold text-green-300">
                                                            <CheckCircleIcon className="w-5 h-5" />
                                                            {formatTime(checkedInTime)}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleCheckIn(conf.id, guestName)}
                                                            disabled={processingCheckin === `${conf.id}-${guestName}`}
                                                            className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded hover:bg-gray-500 disabled:opacity-50"
                                                        >
                                                             {processingCheckin === `${conf.id}-${guestName}` ? '...' : 'Check-in'}
                                                        </button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar para a Lista</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Controle de Entrada</h1>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="relative mb-6">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <SearchIcon className="h-5 w-5 text-gray-400" />
                    </span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Pesquisar por nome da divulgadora ou convidado..."
                        className="w-full pl-10 pr-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-gray-200 text-lg focus:ring-primary focus:border-primary"
                    />
                </div>
                {error && <p className="text-red-400 text-center mb-4">{error}</p>}
                {renderList()}
            </div>
        </div>
    );
};

export default GuestListCheckinPage;