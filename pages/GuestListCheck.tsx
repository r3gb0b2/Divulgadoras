
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { findPromotersByEmail } from '../services/promoterService';
import { getActiveGuestListsForCampaign, addGuestListConfirmation, getGuestListConfirmationsByEmail, createGuestListChangeRequest, getPendingChangeRequestForConfirmation } from '../services/guestListService';
import { Promoter, GuestList, Campaign, GuestListConfirmation, Timestamp, GuestListChangeRequest } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { getAllCampaigns } from '../services/settingsService';

type CountdownStatus = 'upcoming' | 'open' | 'closed';

const useCountdown = (startDate: Date | null, endDate: Date | null) => {
    const [status, setStatus] = useState<CountdownStatus>('closed');
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            let currentStatus: CountdownStatus = 'closed';
            let targetDate: Date | null = null;
            let prefix = '';

            if (startDate && now < startDate) {
                currentStatus = 'upcoming';
                targetDate = startDate;
                prefix = 'Abre em: ';
            } else if (!endDate || now < endDate) {
                currentStatus = 'open';
                targetDate = endDate;
                prefix = 'Fecha em: ';
            } else {
                currentStatus = 'closed';
            }
            
            setStatus(currentStatus);

            if (targetDate) {
                const difference = targetDate.getTime() - now.getTime();
                if (difference > 0) {
                    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                    const minutes = Math.floor((difference / 1000 / 60) % 60);
                    const seconds = Math.floor((difference / 1000) % 60);

                    let timeString = '';
                    if (days > 0) timeString += `${days}d `;
                    timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                    setTimeLeft(prefix + timeString);
                } else {
                    // This handles the case where the timer just ran out
                    setStatus('closed');
                    setTimeLeft('');
                }
            } else {
                // No end date means it's always open (if started)
                 if (currentStatus === 'open') {
                    setTimeLeft('Aberto por tempo indeterminado');
                } else {
                    setTimeLeft('');
                }
            }

        }, 1000);

        return () => clearInterval(interval);
    }, [startDate, endDate]);

    return { status, timeLeft };
};


const GuestListConfirmationForm: React.FC<{ list: GuestList; promoter: Promoter, existingConfirmation?: GuestListConfirmation }> = ({ list, promoter, existingConfirmation }) => {
    const promoterSpecificAssignment = list.assignments?.[promoter.id];
    const finalAllowance = promoterSpecificAssignment?.guestAllowance !== undefined ? promoterSpecificAssignment.guestAllowance : (list.guestAllowance || 0);
    const infoText = promoterSpecificAssignment?.info;

    const [isAttending, setIsAttending] = useState(true);
    const [guestNames, setGuestNames] = useState<string[]>(Array(finalAllowance).fill(''));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    
    const [pendingRequest, setPendingRequest] = useState<GuestListChangeRequest | null>(null);
    const [isCheckingRequest, setIsCheckingRequest] = useState(true);
    const [isRequestingChange, setIsRequestingChange] = useState(false);

    const startDate = list.startsAt ? (list.startsAt as Timestamp).toDate() : null;
    
    const individualClosingDate = promoterSpecificAssignment?.closesAt ? (promoterSpecificAssignment.closesAt as Timestamp).toDate() : null;
    const globalClosingDate = list.closesAt ? (list.closesAt as Timestamp).toDate() : null;
    const finalClosingDate = individualClosingDate || globalClosingDate;

    const { status, timeLeft } = useCountdown(startDate, finalClosingDate);
    const isLocked = existingConfirmation?.isLocked ?? false;
    const isEditing = !!existingConfirmation && !isLocked;

    const isFormDisabled = status !== 'open' || isLocked;


    useEffect(() => {
        if (existingConfirmation) {
            setIsAttending(existingConfirmation.isPromoterAttending);
            const filledGuests = [...(existingConfirmation.guestNames || [])];
            while (filledGuests.length < finalAllowance) {
                filledGuests.push('');
            }
            setGuestNames(filledGuests.slice(0, finalAllowance));
            
            if (isLocked) {
                setIsCheckingRequest(true);
                getPendingChangeRequestForConfirmation(existingConfirmation.id)
                    .then(request => setPendingRequest(request))
                    .catch(err => setError("Falha ao verificar solicitações pendentes."))
                    .finally(() => setIsCheckingRequest(false));
            }
        } else {
             setGuestNames(Array(finalAllowance).fill(''));
        }
    }, [existingConfirmation, finalAllowance, isLocked]);


    const handleGuestNameChange = (index: number, value: string) => {
        const newGuestNames = [...guestNames];
        newGuestNames[index] = value;
        setGuestNames(newGuestNames);
    };

    const handleRequestChange = async () => {
        if (!existingConfirmation) return;
        setIsRequestingChange(true);
        setError('');
        try {
            await createGuestListChangeRequest(existingConfirmation);
            const request = await getPendingChangeRequestForConfirmation(existingConfirmation.id);
            setPendingRequest(request);
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar solicitação.');
        } finally {
            setIsRequestingChange(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        setSuccess(false);
        try {
            await addGuestListConfirmation({
                organizationId: list.organizationId,
                campaignId: list.campaignId,
                campaignName: list.campaignName,
                guestListId: list.id,
                promoterId: promoter.id,
                promoterName: promoter.name,
                promoterEmail: promoter.email,
                listName: list.name,
                isPromoterAttending: isAttending,
                guestNames: isAttending ? (guestNames || []).filter(name => name.trim() !== '') : [],
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Falha ao confirmar presença.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        const submittedGuests = (guestNames || []).filter(name => name.trim() !== '');
        return (
            <div className="space-y-4">
                <div className="bg-green-900/50 border-l-4 border-green-500 text-green-300 p-4 rounded-md">
                    <p className="font-bold">{isEditing ? 'Lista Atualizada!' : 'Presença Confirmada!'}</p>
                    <p>Sua lista para <strong>{list.name}</strong> foi {isEditing ? 'atualizada' : 'enviada'} com sucesso.</p>
                </div>
                <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
                    <h4 className="text-lg font-semibold text-white mb-2">Resumo do Envio:</h4>
                    <ul className="space-y-1 text-gray-300">
                        {isAttending ? (
                            <li className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span><strong>Seu nome:</strong> {promoter.name}</span>
                            </li>
                        ) : (
                             <li className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                     <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span>Você <strong>não</strong> confirmou sua presença.</span>
                            </li>
                        )}
                        {submittedGuests.length > 0 ? (
                            <li className="pt-2">
                                <strong className="block mb-1">Convidados ({submittedGuests.length}):</strong>
                                <ul className="list-disc list-inside pl-2 space-y-1">
                                    {submittedGuests.map((name, index) => (
                                        <li key={index}>{name}</li>
                                    ))}
                                </ul>
                            </li>
                        ) : (
                            isAttending && <li className="pt-2 text-gray-400">Nenhum convidado adicionado.</li>
                        )}
                    </ul>
                </div>
            </div>
        );
    }
    
    if (isLocked && existingConfirmation) {
        const submittedGuests = (existingConfirmation.guestNames || []).filter(name => name.trim() !== '');
        return (
             <div className="space-y-4">
                <div className="bg-green-900/50 border-l-4 border-green-500 text-green-300 p-4 rounded-md">
                    <p className="font-bold">Lista Enviada!</p>
                    <p>Sua lista para <strong>{list.name}</strong> já foi enviada. Para fazer alterações, clique no botão abaixo para solicitar a liberação ao organizador.</p>
                </div>
                <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
                    <h4 className="text-lg font-semibold text-white mb-2">Resumo do Envio:</h4>
                    <ul className="space-y-1 text-gray-300">
                        {existingConfirmation.isPromoterAttending ? (
                             <li className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                <span><strong>Seu nome:</strong> {promoter.name}</span>
                            </li>
                        ) : (
                             <li className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                <span>Você <strong>não</strong> confirmou sua presença.</span>
                            </li>
                        )}
                        {submittedGuests.length > 0 && (
                            <li className="pt-2"><strong className="block mb-1">Convidados ({submittedGuests.length}):</strong>
                                <ul className="list-disc list-inside pl-2 space-y-1">
                                    {submittedGuests.map((name, index) => <li key={index}>{name}</li>)}
                                </ul>
                            </li>
                        )}
                    </ul>
                </div>
                 <div className="text-center pt-4 border-t border-gray-700">
                    {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
                    {isCheckingRequest ? (
                        <p className="text-sm text-gray-400">Verificando...</p>
                    ) : pendingRequest ? (
                        <p className="text-yellow-400 font-semibold bg-yellow-900/50 p-3 rounded-md">Sua solicitação de alteração já foi enviada e está aguardando aprovação do organizador.</p>
                    ) : (
                        <button 
                            onClick={handleRequestChange}
                            disabled={isRequestingChange}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isRequestingChange ? 'Enviando...' : 'Solicitar Alteração'}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm space-y-4">
            <h3 className="text-xl font-bold text-primary">{list.name}</h3>
            {infoText && (
                <div className="bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-300 p-3 rounded-md -mt-2 mb-4" role="alert">
                    <p className="font-bold">Informativo:</p>
                    <p>{infoText}</p>
                </div>
            )}
            {individualClosingDate && (
                 <div className="bg-blue-900/50 border-l-4 border-blue-500 text-blue-300 p-3 rounded-md -mt-2 mb-4" role="alert">
                    <p className="font-bold">Atenção:</p>
                    <p>Seu prazo de envio para esta lista é <strong>{individualClosingDate.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</strong>.</p>
                </div>
            )}
            {list.description && <p className="text-sm text-gray-400 -mt-1 mb-2">{list.description}</p>}
            {(startDate || finalClosingDate) && (
                <div className={`text-center mb-2 p-3 rounded-md text-white font-semibold text-base ${
                    status === 'upcoming' ? 'bg-blue-900/70' :
                    status === 'open' ? 'bg-green-900/70' :
                    'bg-red-900/70'
                }`}>
                    { status === 'closed' && finalClosingDate ? (
                        <span>PRAZO ENCERRADO</span>
                    ) : (
                        <span>{timeLeft}</span>
                    )}
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-red-400 text-sm">{error}</p>}
                
                <div className="p-3 border border-gray-600/50 rounded-md bg-black/20">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isAttending}
                            onChange={(e) => setIsAttending(e.target.checked)}
                            disabled={isFormDisabled}
                            className="h-5 w-5 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary disabled:opacity-50"
                        />
                        <span className="ml-3 font-medium text-gray-200">Confirmar minha presença</span>
                    </label>
                </div>

                {isAttending && finalAllowance > 0 && (
                    <div>
                        <h4 className="font-semibold text-gray-200 mb-2">Adicionar Convidados ({finalAllowance} permitidos)</h4>
                        <div className="space-y-2">
                            {Array.from({ length: finalAllowance }).map((_, index) => (
                                <input
                                    key={index}
                                    type="text"
                                    value={guestNames[index]}
                                    onChange={(e) => handleGuestNameChange(index, e.target.value)}
                                    placeholder={`Nome completo do Convidado ${index + 1}`}
                                    disabled={isFormDisabled}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 disabled:bg-gray-800 disabled:cursor-not-allowed"
                                />
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="text-right">
                    <button
                        type="submit"
                        disabled={isSubmitting || isFormDisabled}
                        className="w-full sm:w-auto px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50"
                    >
                        {isSubmitting ? 'Salvando...' : 
                         status === 'upcoming' ? 'Aguardando Abertura' : 
                         status === 'closed' ? 'Prazo Encerrado' : 
                         (isEditing ? 'Salvar Alterações' : 'Confirmar Lista')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export const GuestListCheck: React.FC = () => {
    const navigate = useNavigate();
    const { campaignId } = useParams<{ campaignId: string }>();

    const [email, setEmail] = useState('');
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [assignedLists, setAssignedLists] = useState<GuestList[] | null>(null);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [existingConfirmations, setExistingConfirmations] = useState<GuestListConfirmation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        const fetchCampaign = async () => {
            if (!campaignId) {
                setError("Link de evento inválido.");
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                // We need the org ID to get all campaigns
                const allLists = await getActiveGuestListsForCampaign(campaignId);
                let orgId: string | undefined;
                if (allLists.length > 0) {
                    orgId = allLists[0].organizationId;
                }
                
                if (orgId) {
                    const allCampaigns = await getAllCampaigns(orgId);
                    const camp = allCampaigns.find(c => c.id === campaignId);
                    if (camp) {
                        setCampaign(camp);
                    } else {
                        setError("Evento não encontrado ou não está mais ativo.");
                    }
                } else {
                     setError("Este evento não possui listas de convidados ativas no momento.");
                }
            } catch (err: any) {
                setError(err.message || 'Erro ao carregar detalhes do evento.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchCampaign();
    }, [campaignId]);

    const performSearch = async (searchEmail: string) => {
        if (!searchEmail || !campaignId) return;
        setIsLoading(true);
        setError(null);
        setPromoter(null);
        setAssignedLists(null);
        setExistingConfirmations([]);
        setSearched(true);
        try {
            const [promoterProfiles, confirmations] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getGuestListConfirmationsByEmail(searchEmail)
            ]);

            if (!promoterProfiles || promoterProfiles.length === 0) {
                setError("Nenhum cadastro de divulgadora encontrado para este e-mail.");
                return;
            }

            const campaignName = campaign?.name;
            const orgId = campaign?.organizationId;

            const approvedProfile = promoterProfiles.find(p => 
                p.status === 'approved' &&
                p.organizationId === orgId &&
                (p.campaignName === campaignName || (p.associatedCampaigns || []).includes(campaignName || ''))
            );

            if (!approvedProfile) {
                setError("Você não tem permissão para acessar as listas deste evento. Verifique se seu cadastro foi aprovado para este evento específico.");
                return;
            }
            
            setPromoter(approvedProfile);
            setExistingConfirmations(confirmations);

            const activeLists = await getActiveGuestListsForCampaign(campaignId);

            const accessibleLists = activeLists.filter(list => {
                const hasAssignments = list.assignments && Object.keys(list.assignments).length > 0;
                if (!hasAssignments) {
                    return true; // Open to all approved promoters
                }
                // Check if the promoter's ID is a key in the assignments object
                return list.assignments?.[approvedProfile.id] !== undefined;
            });

            if (accessibleLists.length > 0) {
                setAssignedLists(accessibleLists);
            } else {
                setError("Nenhuma lista de convidados está ativa para você neste evento no momento.");
            }
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao verificar seu acesso.');
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
        if (error) return <p className="text-red-400 mt-4 text-center">{error}</p>;
        
        if (promoter && assignedLists && assignedLists.length > 0) {
            return (
                <div className="space-y-6">
                    {assignedLists.map(list => {
                        const existingConf = existingConfirmations.find(c => c.guestListId === list.id);
                        return <GuestListConfirmationForm key={list.id} list={list} promoter={promoter} existingConfirmation={existingConf} />
                    })}
                </div>
            );
        }
        
        return null;
    };

    if (isLoading && !campaign) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    if (error && !campaign) {
        return (
            <div className="max-w-2xl mx-auto text-center">
                 <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <p className="text-red-400 text-center py-4">{error}</p>
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
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Lista de Convidados</h1>
                <p className="text-center text-primary font-semibold mb-2">{campaign?.name || 'Carregando evento...'}</p>
                <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para acessar suas listas.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                    >
                        {isLoading ? 'Verificando...' : 'Verificar Acesso'}
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
