import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { checkPromoterStatus, updatePromoter } from '../services/promoterService';
import { getCampaigns } from '../services/settingsService';
import { Promoter } from '../types';
import { WhatsAppIcon } from '../components/Icons';
import { stateMap } from '../constants/states';

// This new component will handle displaying the status for a single registration
const StatusCard: React.FC<{ promoter: Promoter }> = ({ promoter }) => {
    const [whatsappGroupLink, setWhatsappGroupLink] = useState<string>('');
    const [hasAcceptedRules, setHasAcceptedRules] = useState(promoter.hasJoinedGroup || false);
    const [cardError, setCardError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCampaignLink = async () => {
            if (promoter && promoter.status === 'approved' && promoter.campaignName) {
                try {
                    const campaigns = await getCampaigns(promoter.state);
                    const campaign = campaigns.find(c => c.name === promoter.campaignName);
                    if (campaign) {
                        setWhatsappGroupLink(campaign.whatsappLink);
                    }
                } catch (e) {
                    console.error("Failed to fetch campaign link", e);
                }
            }
        };
        fetchCampaignLink();
    }, [promoter]);

    const handleAcceptRules = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setHasAcceptedRules(isChecked);

        if (isChecked && promoter && !promoter.hasJoinedGroup) {
            try {
                await updatePromoter(promoter.id, { hasJoinedGroup: true });
                // No need to update local state promoter, this is a one-time action per card
            } catch (updateError) {
                console.error("Failed to update status:", updateError);
                setCardError("Não foi possível salvar sua confirmação. Tente novamente.");
                setHasAcceptedRules(false); // Revert on failure
            }
        }
    };
    
    const statusInfoMap = {
        pending: {
            title: 'Em Análise',
            message: 'Seu cadastro está em análise. Continue consultando esta página para saber o resultado da sua aprovação, pois não entramos em contato para informar.',
            styles: 'bg-blue-900/50 border-blue-500 text-blue-300'
        },
        approved: {
            title: 'Aprovado!',
            message: 'Parabéns! Seu cadastro foi aprovado. O próximo passo é ler as regras e confirmar a leitura para liberar o acesso ao grupo.',
            styles: 'bg-green-900/50 border-green-500 text-green-300'
        },
        rejected: {
            title: 'Não Aprovado',
            message: 'Agradecemos o seu interesse, mas no momento seu perfil não foi selecionado. Boa sorte na próxima!',
            styles: 'bg-red-900/50 border-red-500 text-red-300'
        }
    };

    const statusInfo = statusInfoMap[promoter.status];

    if (!statusInfo) {
         return <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 rounded-md"><p>Ocorreu um erro ao verificar o status deste cadastro.</p></div>;
    }

    const finalMessage = promoter.status === 'rejected' && promoter.rejectionReason
        ? promoter.rejectionReason
        : statusInfo.message;

    return (
        <div className={`${statusInfo.styles} border-l-4 p-4 rounded-md`} role="alert">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-bold">{statusInfo.title}</p>
                    {promoter.campaignName && <p className="text-sm font-semibold -mt-1">{promoter.campaignName}</p>}
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full bg-black/20">{stateMap[promoter.state.toUpperCase()] || promoter.state}</div>
            </div>

            <p className="mt-2 whitespace-pre-wrap">{finalMessage}</p>
            {cardError && <p className="text-red-300 text-sm mt-2">{cardError}</p>}
            
            {promoter.status === 'approved' && (
                <div className="mt-4 space-y-4">
                    {promoter.campaignName ? (
                        <Link
                            to={`/rules/${promoter.state}/${encodeURIComponent(promoter.campaignName)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block w-full text-center bg-primary text-white font-bold py-3 px-4 rounded hover:bg-primary-dark transition-colors"
                        >
                            Ver as Regras (Obrigatório)
                        </Link>
                    ) : (
                        <button
                            disabled
                            className="inline-block w-full text-center bg-gray-600 text-white font-bold py-3 px-4 rounded cursor-not-allowed"
                        >
                            Regras Indisponíveis (Evento não especificado)
                        </button>
                    )}
                    
                    <div className="p-3 border border-gray-600/50 rounded-md bg-black/20">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasAcceptedRules}
                                onChange={handleAcceptRules}
                                className="h-5 w-5 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary"
                            />
                            <span className="ml-3 font-medium text-gray-200">Li e concordo com todas as regras.</span>
                        </label>
                    </div>

                    {hasAcceptedRules && (
                       <a
                            href={whatsappGroupLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center justify-center w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors text-lg ${!whatsappGroupLink ? 'opacity-50 cursor-not-allowed' : ''}`}
                       >
                            <WhatsAppIcon className="w-6 h-6 mr-2"/>
                            {whatsappGroupLink ? 'Entrar no Grupo' : 'Link do grupo indisponível'}
                       </a>
                    )}
                </div>
            )}
        </div>
    );
};

const StatusCheck: React.FC = () => {
    const [email, setEmail] = useState('');
    const [promoters, setPromoters] = useState<Promoter[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setPromoters(null);
        setSearched(true);
        try {
            const result = await checkPromoterStatus(email);
            setPromoters(result);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderStatusResult = () => {
        if (!searched || isLoading || error) {
            return null;
        }

        if (!promoters) {
            return <p className="text-center text-gray-400 mt-4">Nenhum cadastro encontrado para este e-mail.</p>;
        }

        return (
            <div className="space-y-4">
                {promoters.map(p => <StatusCard key={p.id} promoter={p} />)}
            </div>
        );
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Verificar Status do Cadastro</h1>
                <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver o status.</p>
                
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
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                        {isLoading ? 'Verificando...' : 'Verificar'}
                    </button>
                </form>

                {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
                
                <div className="mt-8">
                    {renderStatusResult()}
                </div>
            </div>
        </div>
    );
};

export default StatusCheck;