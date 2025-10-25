import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { findPromotersByEmail } from '../services/promoterService';
import { getGuestListById, addGuestListConfirmation } from '../services/guestListService';
import { Promoter, GuestList } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const useCountdown = (targetDate: Date | null) => {
    const [timeLeft, setTimeLeft] = useState({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isOver: false,
    });

    useEffect(() => {
        if (!targetDate) {
            setTimeLeft(prev => ({ ...prev, isOver: false })); // No deadline, not over
            return;
        }
        
        // Initial check
        if (targetDate.getTime() < new Date().getTime()) {
             setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
             return;
        }

        const interval = setInterval(() => {
            const now = new Date();
            const difference = targetDate.getTime() - now.getTime();

            if (difference > 0) {
                setTimeLeft({
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60),
                    isOver: false,
                });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    return timeLeft;
};

const GuestListConfirmationForm: React.FC<{ list: GuestList; promoter: Promoter }> = ({ list, promoter }) => {
    const [isAttending, setIsAttending] = useState(true);
    const [guestNames, setGuestNames] = useState<string[]>(Array(list.guestAllowance).fill(''));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    
    const closingDate = list.closesAt ? (list.closesAt as Timestamp).toDate() : null;
    const { days, hours, minutes, seconds, isOver } = useCountdown(closingDate);

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
                organizationId: list.organizationId,
                campaignId: list.campaignId,
                campaignName: list.campaignName,
                guestListId: list.id,
                promoterId: promoter.id,
                promoterName: promoter.name,
                promoterEmail: promoter.email,
                listName: list.name,
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
                <p>Sua lista para <strong>{list.name}</strong> no evento <strong>{list.campaignName}</strong> foi enviada com sucesso.</p>
            </div>
        );
    }

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm space-y-4">
             {closingDate && !success && (
                <div className={`text-center mb-2 p-3 rounded-md text-white font-bold text-lg ${isOver ? 'bg-red-900/70' : 'bg-blue-900/70'}`}>
                    {isOver ? (
                        <span>LISTA ENCERRADA</span>
                    ) : (
                        <span>
                            ENCERRA EM: {days > 0 && `${days}d `}{hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </span>
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
                            disabled={isOver}
                            className="h-5 w-5 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary disabled:opacity-50"
                        />
                        <span className="ml-3 font-medium text-gray-200">Confirmar minha presença</span>
                    </label>
                </div>

                {isAttending && list.guestAllowance > 0 && (
                    <div>
                        <h4 className="font-semibold text-gray-200 mb-2">Adicionar Convidados ({list.guestAllowance} permitidos)</h4>
                        <div className="space-y-2">
                            {Array.from({ length: list.guestAllowance }).map((_, index) => (
                                <input
                                    key={index}
                                    type="text"
                                    value={guestNames[index]}
                                    onChange={(e) => handleGuestNameChange(index, e.target.value)}
                                    placeholder={`Nome completo do Convidado ${index + 1}`}
                                    disabled={isOver}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 disabled:bg-gray-800 disabled:cursor-not-allowed"
                                />
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="text-right">
                    <button
                        type="submit"
                        disabled={isSubmitting || isOver}
                        className="w-full sm:w-auto px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50"
                    >
                        {isSubmitting ? 'Confirmando...' : (isOver ? 'Lista Encerrada' : 'Confirmar Lista')}
                    </button>
                </div>
            </form>
        </div>
    );
};

const GuestListCheck: React.FC = () => {
    const navigate = useNavigate();
    const { listId } = useParams<{ listId: string }>();

    const [email, setEmail] = useState('');
    const [list, setList] = useState<GuestList | null>(null);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        const fetchList = async () => {
            if (!listId) {
                setError("Link de lista inválido ou corrompido.");
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                const listData = await getGuestListById(listId);
                if (listData && listData.isActive) {
                    setList(listData);
                } else {
                    setError("Esta lista de convidados não foi encontrada ou não está mais ativa.");
                }
            } catch (err: any) {
                setError(err.message || 'Erro ao carregar detalhes da lista.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchList();
    }, [listId]);

    const performSearch = async (searchEmail: string) => {
        if (!searchEmail || !list) return;
        setIsLoading(true);
        setError(null);
        setPromoter(null);
        setSearched(true);
        try {
            const promoterProfiles = await findPromotersByEmail(searchEmail);
            if (!promoterProfiles || promoterProfiles.length === 0) {
                setError("Nenhum cadastro de divulgadora encontrado para este e-mail.");
                return;
            }

            const assignedPromoter = promoterProfiles.find(p => list.assignedPromoterIds.includes(p.id));

            if (assignedPromoter) {
                setPromoter(assignedPromoter);
            } else {
                setError("Você não foi atribuída para esta lista específica. Entre em contato com o organizador.");
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
        if (error) return <p className="text-red-500 mt-4 text-center">{error}</p>;
        
        if (promoter && list) {
            return <GuestListConfirmationForm list={list} promoter={promoter} />;
        }
        
        return null;
    };

    if (isLoading && !list) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    if (error && !list) {
        return (
            <div className="max-w-2xl mx-auto text-center">
                 <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-2xl font-bold text-red-400 mb-4">Erro ao Carregar Lista</h1>
                    <p className="text-gray-300">{error}</p>
                    <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 bg-primary text-white rounded-md">Voltar à Página Inicial</button>
                 </div>
            </div>
        );
    }
    
    if (!list) return null;

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">{list.campaignName}</h1>
                <p className="text-center text-primary font-semibold text-lg mb-2">{list.name}</p>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail de cadastro para confirmar sua presença e de seus convidados.</p>
                
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
                        {isLoading ? 'Verificando...' : 'Buscar Acesso'}
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