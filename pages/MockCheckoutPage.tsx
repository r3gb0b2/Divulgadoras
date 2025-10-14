import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Plan, plans } from './PricingPage';
import { getPagSeguroCredentials } from '../services/credentialsService';

declare global {
    interface Window {
        PagSeguro: any;
    }
}

const CheckoutPage: React.FC = () => {
    const { planId, orgName, email, passwordB64 } = useParams();
    const navigate = useNavigate();

    const plan = plans.find(p => p.id === planId);
    const password = passwordB64 ? atob(passwordB64) : '';

    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [cardInstance, setCardInstance] = useState<any>(null);
    const cardContainerRef = useRef<HTMLDivElement>(null);
    const [sdkReady, setSdkReady] = useState(false);

    // Effect to wait for the PagSeguro SDK to be loaded from index.html
    useEffect(() => {
        if (window.PagSeguro) {
            setSdkReady(true);
            return;
        }

        const intervalId = setInterval(() => {
            if (window.PagSeguro) {
                setSdkReady(true);
                clearInterval(intervalId);
            }
        }, 100);

        const timeoutId = setTimeout(() => {
            clearInterval(intervalId);
            if (!window.PagSeguro) {
                setError("SDK do PagSeguro não carregou. Verifique sua conexão e tente novamente.");
                setIsLoading(false);
            }
        }, 10000); // 10 second timeout

        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, []);

    // Effect to initialize the card form once the SDK is ready
    useEffect(() => {
        if (!sdkReady || !plan || cardInstance) { // Prevent re-initialization
            return;
        }

        const initializeForm = async () => {
            try {
                const creds = await getPagSeguroCredentials();
                if (!creds.publicKey) {
                    throw new Error("Chave pública do PagSeguro não configurada.");
                }

                if (!window.PagSeguro) {
                    throw new Error("SDK do PagSeguro não está disponível no objeto window.");
                }
                
                const instance = window.PagSeguro.connect({
                    publicKey: creds.publicKey,
                    environment: "production",
                });
                
                if (cardContainerRef.current) {
                     const card = instance.card({
                        form: {
                            id: 'pagseguro-card-form'
                        },
                        card: {
                            id: 'pagseguro-card-container'
                        }
                    });
                    setCardInstance(card);
                }

            } catch (err: any) {
                setError(err.message || "Falha ao inicializar o pagamento.");
            } finally {
                setIsLoading(false);
            }
        };

        initializeForm();
    }, [sdkReady, plan, cardInstance]);

    const handlePaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cardInstance) {
            setError("O formulário de pagamento não está pronto.");
            return;
        }

        setIsProcessing(true);
        setError('');

        try {
            const response = await cardInstance.createToken({
                useForm: true
            });
            
            if (response.error) {
                const errorMessage = Array.isArray(response.error) && response.error.length > 0
                    ? response.error.map((err: any) => err.message).join('; ')
                    : response.error.message || 'Dados do cartão inválidos.';
                throw new Error(errorMessage);
            }

            // At this point, PagSeguro has validated and tokenized the card.
            // We now create the user and organization in our system.
            const createOrgAndUser = httpsCallable(functions, 'createOrganizationAndUser');
            await createOrgAndUser({
                orgName: decodeURIComponent(orgName || ''),
                email: decodeURIComponent(email || ''),
                password,
                planId,
            });

            // If the cloud function is successful, redirect to admin login
            alert('Pagamento aprovado e conta criada com sucesso! Você já pode fazer o login.');
            navigate('/admin/login');

        } catch (err: any) {
            console.error("Payment/Creation error:", err);
            setError(err.message || 'Ocorreu um erro. Verifique os dados ou tente novamente.');
            setIsProcessing(false);
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
                 {(isLoading || isProcessing) && (
                    <div className="absolute inset-0 bg-secondary bg-opacity-90 flex flex-col justify-center items-center rounded-lg z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="mt-4 text-gray-300">{isLoading ? 'Carregando checkout...' : 'Processando pagamento...'}</p>
                    </div>
                )}
                <h1 className="text-3xl font-bold text-center text-white mb-2">Finalizar Assinatura</h1>
                <p className="text-center text-gray-400 mb-6">Plano {plan.name} - {plan.priceFormatted}/mês</p>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
                
                <form id="pagseguro-card-form" onSubmit={handlePaymentSubmit} className="space-y-4">
                    <div className="p-4 rounded-md bg-gray-800/50 text-gray-300">
                        <p><strong>Empresa:</strong> {decodeURIComponent(orgName)}</p>
                        <p><strong>E-mail:</strong> {decodeURIComponent(email)}</p>
                    </div>

                    <div id="pagseguro-card-container" ref={cardContainerRef}></div>

                    <button 
                        type="submit" 
                        disabled={isLoading || isProcessing || !cardInstance}
                        className="w-full py-3 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50"
                    >
                        Pagar com Cartão
                    </button>
                </form>

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