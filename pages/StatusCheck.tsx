import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { checkPromoterStatus, updatePromoter } from '../services/promoterService';
import { Promoter } from '../types';
import { WhatsAppIcon } from '../components/Icons';

const StatusCheck: React.FC = () => {
    const [email, setEmail] = useState('');
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [hasAcceptedRules, setHasAcceptedRules] = useState(false);
    
    useEffect(() => {
        if(promoter?.status === 'approved') {
            setHasAcceptedRules(promoter.hasJoinedGroup || false);
        }
    }, [promoter]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setPromoter(null);
        setSearched(true);
        try {
            const result = await checkPromoterStatus(email);
            setPromoter(result);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAcceptRules = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setHasAcceptedRules(isChecked); // Update UI immediately

        if (isChecked && promoter && !promoter.hasJoinedGroup) {
            try {
                await updatePromoter(promoter.id, { hasJoinedGroup: true });
                // Also update local state to prevent re-triggering the update
                setPromoter(prev => prev ? { ...prev, hasJoinedGroup: true } : null);
            } catch (updateError) {
                console.error("Failed to update status:", updateError);
                setError("Não foi possível salvar sua confirmação. Tente novamente.");
                setHasAcceptedRules(false); // Revert on failure
            }
        }
    };

    const statusInfoMap = {
        pending: {
            title: 'Em Análise',
            message: 'Seu cadastro está em análise. Entraremos em contato em breve!',
            styles: 'bg-blue-100 border-blue-500 text-blue-700'
        },
        approved: {
            title: 'Aprovado!',
            message: 'Parabéns! Seu cadastro foi aprovado. O próximo passo é ler as regras e confirmar a leitura para liberar o acesso ao grupo.',
            styles: 'bg-green-100 border-green-500 text-green-700'
        },
        rejected: {
            title: 'Não Aprovado',
            message: 'Agradecemos o seu interesse, mas no momento seu perfil não foi selecionado. Boa sorte na próxima!',
            styles: 'bg-red-100 border-red-500 text-red-700'
        }
    };
    
    const renderStatusResult = () => {
        if (!searched || isLoading || error) {
            return null;
        }

        if (!promoter) {
            return <p className="text-center text-gray-500 dark:text-gray-400">Nenhum cadastro encontrado para este e-mail.</p>;
        }

        const statusInfo = statusInfoMap[promoter.status];

        if (!statusInfo) {
             return <p className="text-center text-red-500 dark:text-red-400">Ocorreu um erro ao verificar o status. Por favor, contate o suporte.</p>;
        }

        const finalMessage = promoter.status === 'rejected' && promoter.rejectionReason
            ? promoter.rejectionReason
            : statusInfo.message;
        
        const whatsappGroupLink = 'https://chat.whatsapp.com/Dd3ztUQsQjc2hlsXldHFLe';

        return (
            <div className={`${statusInfo.styles} border-l-4 p-4 rounded-md`} role="alert">
                <p className="font-bold">{statusInfo.title}</p>
                <p className="whitespace-pre-wrap">{finalMessage}</p>
                {promoter.status === 'approved' && (
                    <div className="mt-4 space-y-4">
                        <Link
                            to="/rules"
                            target="_blank" // Open in new tab so user doesn't lose this page
                            rel="noopener noreferrer"
                            className="inline-block w-full text-center bg-primary text-white font-bold py-3 px-4 rounded hover:bg-primary-dark transition-colors"
                        >
                            Ver as Regras (Obrigatório)
                        </Link>
                        
                        <div className="p-3 border border-gray-300/50 dark:border-gray-500/50 rounded-md bg-white/20">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hasAcceptedRules}
                                    onChange={handleAcceptRules}
                                    className="h-5 w-5 text-primary rounded border-gray-400 focus:ring-primary"
                                />
                                <span className="ml-3 font-medium text-gray-800">Li e concordo com todas as regras.</span>
                            </label>
                        </div>

                        {hasAcceptedRules && (
                           <a
                                href={whatsappGroupLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors text-lg"
                           >
                                <WhatsAppIcon className="w-6 h-6 mr-2"/>
                                Entrar no Grupo
                           </a>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">Verificar Status do Cadastro</h1>
                <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver o status.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-pink-300 disabled:cursor-not-allowed transition-all duration-300"
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