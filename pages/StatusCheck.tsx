import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { checkPromoterStatus } from '../services/promoterService';
import { Promoter } from '../types';

const StatusCheck: React.FC = () => {
    const [email, setEmail] = useState('');
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

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

    const statusInfoMap = {
        pending: {
            title: 'Em Análise',
            message: 'Seu cadastro está em análise. Entraremos em contato em breve!',
            styles: 'bg-blue-100 border-blue-500 text-blue-700'
        },
        approved: {
            title: 'Aprovado!',
            message: 'Parabéns! Seu cadastro foi aprovado. Clique no botão abaixo para ler as regras e acessar o link do grupo.',
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
            ? `${statusInfo.message}\n\nMotivo: ${promoter.rejectionReason}`
            : statusInfo.message;

        return (
            <div className={`${statusInfo.styles} border-l-4 p-4 rounded-md`} role="alert">
                <p className="font-bold">{statusInfo.title}</p>
                <p className="whitespace-pre-wrap">{finalMessage}</p>
                {promoter.status === 'approved' && (
                    <div className="mt-4">
                        <Link
                            to="/rules"
                            className="inline-block w-full text-center bg-primary text-white font-bold py-3 px-4 rounded hover:bg-primary-dark transition-colors"
                        >
                            Próximo Passo: Ler as Regras
                        </Link>
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