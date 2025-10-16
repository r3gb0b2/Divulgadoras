import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getApprovedEventsForPromoter } from '../services/promoterService';
import { getCampaigns, getAllCampaigns } from '../services/settingsService';
import { addGuestListConfirmation } from '../services/guestListService';
import { Promoter, Campaign } from '../types';
import { ArrowLeftIcon } from '../components/Icons';

interface EventWithCampaign extends Promoter {
    campaignDetails: Campaign;
}

const GuestListConfirmationCard: React.FC<{ event: EventWithCampaign }> = ({ event }) => {
    const { campaignDetails } = event;
    const [isAttending, setIsAttending] = useState(true);
    const [guestNames, setGuestNames] = useState<string[]>(Array(campaignDetails.guestAllowance || 0).fill(''));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleGuestNameChange = (index: number, value: string) => {
        const newGuestNames = [...guestNames];
        newGuestNames[index] = value;
        setGuestNames(newGuestNames);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        setSuccess(false);
        try {
            await addGuestListConfirmation({
                organizationId: event.organizationId,
                campaignId: campaignDetails.id,
                campaignName: campaignDetails.name,
                promoterId: event.id,
                promoterName: event.name,
                promoterEmail: event.email,
                isPromoterAttending: isAttending,
                guestNames: isAttending ? guestNames.filter(name => name.trim() !== '') : [],
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Falha ao confirmar presença.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
             <div className="bg-green-900/50 border-l-4 border-green-500 text-green-300 p-4 rounded-md">
                <p className="font-bold">Presença Confirmada!</p>
                <p>Sua lista para o evento <strong>{campaignDetails.name}</strong> foi enviada com sucesso.</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="bg-dark/70 p-4 rounded-lg shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-primary">{campaignDetails.name}</h3>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            
            <div className="p-3 border border-gray-600/50 rounded-md bg-black/20">
                <label className="flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isAttending}
                        onChange={(e) => setIsAttending(e.target.checked)}
                        className="h-5 w-5 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary"
                    />
                    <span className="ml-3 font-medium text-gray-200">Confirmar minha presença</span>
                </label>
            </div>

            {isAttending && (campaignDetails.guestAllowance || 0) > 0 && (
                <div>
                    <h4 className="font-semibold text-gray-200 mb-2">Adicionar Convidados ({campaignDetails.guestAllowance} permitidos)</h4>
                    <div className="space-y-2">
                        {Array.from({ length: campaignDetails.guestAllowance || 0 }).map((_, index) => (
                            <input
                                key={index}
                                type="text"
                                value={guestNames[index]}
                                onChange={(e) => handleGuestNameChange(index, e.target.value)}
                                placeholder={`Nome completo do Convidado ${index + 1}`}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                            />
                        ))}
                    </div>
                </div>
            )}
            
            <div className="text-right">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50"
                >
                    {isSubmitting ? 'Confirmando...' : 'Confirmar Lista'}
                </button>
            </div>
        </form>
    );
};

const GuestListCheck: React.FC = () => {
    const navigate = useNavigate();
    const { organizationId, campaignId } = useParams<{ organizationId: string; campaignId: string }>();

    const [email, setEmail] = useState('');
    const [events, setEvents] = useState<EventWithCampaign[] | null>(null);
    const [directCampaign, setDirectCampaign] = useState<Campaign | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        const fetchDirectCampaign = async () => {
            if (organizationId && campaignId) {
                setIsLoading(true);
                try {
                    const allCampaignsForOrg = await getAllCampaigns(organizationId);
                    const foundCampaign = allCampaignsForOrg.find(c => c.id === campaignId);

                    if (foundCampaign && foundCampaign.isGuestListActive) {
                        setDirectCampaign(foundCampaign);
                    } else {
                        setError("Evento não encontrado ou a lista de presença não está ativa para ele.");
                    }
                } catch (err: any) {
                    setError(err.message || 'Erro ao carregar detalhes do evento.');
                } finally {
                    setIsLoading(false);
                }
            }
        };

        fetchDirectCampaign();
    }, [organizationId, campaignId]);

    const performSearch = async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setEvents(null);
        setSearched(true);
        try {
            const approvedPromoterEntries = await getApprovedEventsForPromoter(searchEmail);
            if (!approvedPromoterEntries || approvedPromoterEntries.length === 0) {
                setEvents([]);
                return;
            }

            if (directCampaign) {
                const entryForThisEvent = approvedPromoterEntries.find(entry =>
                    entry.organizationId === directCampaign.organizationId &&
                    entry.state === directCampaign.stateAbbr &&
                    entry.campaignName === directCampaign.name
                );

                if (entryForThisEvent) {
                    setEvents([{ ...entryForThisEvent, campaignDetails: directCampaign }]);
                } else {
                    setEvents([]);
                    setError("Seu cadastro não foi encontrado ou aprovado para este evento específico. Verifique o e-mail digitado.");
                }
            } else {
                // Legacy mode: find all events with active guest lists
                const eventsWithDetails: EventWithCampaign[] = [];
                for (const entry of approvedPromoterEntries) {
                    if (entry.state && entry.campaignName) {
                        const campaigns = await getCampaigns(entry.state, entry.organizationId);
                        const campaignDetails = campaigns.find(c => c.name === entry.campaignName && c.isGuestListActive);
                        if (campaignDetails) {
                            eventsWithDetails.push({ ...entry, campaignDetails });
                        }
                    }
                }
                setEvents(eventsWithDetails);
            }
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao buscar seus eventos.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };

    const renderResult = () => {
        if (!searched) return null;
        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            );
        }
        if (error) return <p className="text-red-500 mt-4 text-center">{error}</p>;
        if (!events || events.length === 0) {
            return <p className="text-center text-gray-400 mt-4">Nenhum evento com lista de presença ativa encontrado para este e-mail.</p>;
        }
        return (
            <div className="space-y-4">
                {events.map(event => <GuestListConfirmationCard key={event.id} event={event} />)}
            </div>
        );
    };

    const renderHeader = () => {
        if (directCampaign) {
            return (
                <>
                    <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Confirmar Presença</h1>
                    <p className="text-center text-primary font-semibold text-lg mb-2">{directCampaign.name}</p>
                    <p className="text-center text-gray-400 mb-8">Digite seu e-mail de cadastro para confirmar sua presença e de seus convidados.</p>
                </>
            );
        }
        return (
            <>
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Confirmar Presença na Lista</h1>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail de cadastro para ver os eventos disponíveis e confirmar sua presença e de seus convidados.</p>
            </>
        );
    };

    if (isLoading && !searched) { // Initial load for direct link
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    // This handles critical error on direct link load (e.g. bad campaignId)
    if (error && campaignId && !searched) {
        return (
            <div className="max-w-2xl mx-auto text-center">
                 <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-2xl font-bold text-red-400 mb-4">Erro ao Carregar Evento</h1>
                    <p className="text-gray-300">{error}</p>
                    <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 bg-primary text-white rounded-md">Voltar à Página Inicial</button>
                 </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                {renderHeader()}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
                    >
                        {isLoading ? 'Verificando...' : 'Buscar'}
                    </button>
                </form>
                
                <div className="mt-8">
                    {renderResult()}
                </div>
            </div>
        </div>
    );
};

export default GuestListCheck;