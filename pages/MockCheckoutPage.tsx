import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Plan } from './PricingPage';
import { getStripeCredentials } from '../services/credentialsService';

declare global {
    interface Window {
        Stripe: any;
    }
}

const CheckoutPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { plan, orgName, email, password } = (location.state as { plan: Plan; orgName: string; email: string; password: string }) || {};

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [stripePublicKey, setStripePublicKey] = useState<string | null>(null);

    useEffect(() => {
        const fetchStripeKey = async () => {
            setIsLoading(true);
            try {
                const creds = await getStripeCredentials();
                if (!creds.publicKey) {
                    throw new Error("Chave publicável do Stripe não configurada no painel do Super Admin.");
                }
                setStripePublicKey(creds.publicKey);
            } catch (err: any) {
                setError("Falha ao carregar a configuração de pagamento. Verifique se as chaves do Stripe foram salvas pelo Super Admin.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchStripeKey();
    }, []);
    

    const handlePaymentSubmit = async () => {
        if (!stripePublicKey) {
            setError("A configuração do Stripe não está pronta. Tente novamente.");
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const createCheckoutSession = httpsCallable(functions, 'createStripeCheckoutSession');
            const result = await createCheckoutSession({ 
                planId: plan.id, 
                orgName, 
                email, 
                password 
            });
            
            const { sessionId } = result.data as { sessionId: string };

            const stripe = window.Stripe(stripePublicKey);
            const { error } = await stripe.redirectToCheckout({ sessionId });

            if (error) {
                console.error("Stripe redirect error:", error);
                setError(error.message || "Não foi possível redirecionar para o pagamento.");
                setIsLoading(false);
            }

        } catch (err: any) {
            console.error("Cloud function error:", err);
            setError(err.message || 'Ocorreu um erro ao iniciar o pagamento. Tente novamente.');
            setIsLoading(false);
        }
    };

    if (!plan || !orgName || !email || !password) {
        return (
            <div className="max-w-md mx-auto text-center bg-secondary p-8 rounded-lg">
                <h1 className="text-2xl font-bold text-red-400">Erro</h1>
                <p className="text-gray-300 mt-4">Informações da assinatura ausentes. Por favor, inicie o processo pela página de planos.</p>
                <Link to="/planos" className="inline-block mt-6 px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">
                    Voltar aos Planos
                </Link>
            </div>
        );
    }
    
    return (
        <div className="max-w-lg mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8 relative">
                 {isLoading && (
                    <div className="absolute inset-0 bg-secondary bg-opacity-90 flex flex-col justify-center items-center rounded-lg z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="mt-4 text-gray-300">Preparando checkout...</p>
                    </div>
                )}
                <h1 className="text-3xl font-bold text-center text-white mb-2">Finalizar Assinatura</h1>
                <p className="text-center text-gray-400 mb-6">Plano {plan.name} - {plan.priceFormatted}/mês</p>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
                
                <div className="space-y-4 bg-gray-800/50 p-4 rounded-md">
                    <div>
                        <span className="text-sm font-medium text-gray-400">Empresa:</span>
                        <p className="font-semibold text-gray-200">{orgName}</p>
                    </div>
                     <div>
                        <span className="text-sm font-medium text-gray-400">E-mail:</span>
                        <p className="font-semibold text-gray-200">{email}</p>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                     <p className="text-sm text-center text-gray-400">Você será redirecionado para o ambiente seguro do Stripe para finalizar o pagamento com cartão de crédito.</p>
                     <button 
                        onClick={handlePaymentSubmit} 
                        disabled={isLoading || !stripePublicKey}
                        className="w-full py-3 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50"
                    >
                        Pagar com Cartão
                    </button>
                </div>
                

                <div className="text-center mt-4">
                     <Link to="/planos" className="inline-block text-sm text-gray-400 hover:text-white">
                        Cancelar e voltar
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;