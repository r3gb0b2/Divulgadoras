import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { signUpAndCreateOrganization } from '../services/adminService';
import { getMercadoPagoCredentials } from '../services/credentialsService';
import { Plan } from './PricingPage';

// This is a global variable from the Mercado Pago script
declare global {
    interface Window {
        MercadoPago: any;
    }
}

const MockCheckoutPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { plan, orgName, email, password } = (location.state as { plan: Plan; orgName: string; email: string; password: string }) || {};

    const cardPaymentBrickController = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true); // Start loading to initialize MP
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const initializeMercadoPago = async () => {
            setError('');
            try {
                const creds = await getMercadoPagoCredentials();
                if (!creds.publicKey) {
                    throw new Error("A chave pública do Mercado Pago não foi configurada pelo administrador.");
                }

                const mp = new window.MercadoPago(creds.publicKey);

                const bricksBuilder = mp.bricks();

                const renderCardPaymentBrick = async (bricksBuilder: any) => {
                    const settings = {
                        initialization: {
                            amount: plan.price,
                            payer: {
                                email: email,
                            },
                        },
                        customization: {
                            visual: {
                                style: {
                                    theme: 'dark',
                                }
                            }
                        },
                        callbacks: {
                            onReady: () => {
                                setIsLoading(false);
                            },
                            onSubmit: async (cardFormData: any) => {
                                // This is where the real payment processing would happen.
                                // The frontend receives a tokenized card and sends it to the backend.
                                // The backend uses the Access Token to create the payment.
                                // Here, we will SIMULATE this by directly calling our account creation function.
                                setIsProcessing(true);
                                setError('');
                                try {
                                    // SIMULATION: In a real app, you would send cardFormData
                                    // to your backend, process the payment, and only then create the organization.
                                    console.log('Simulating payment processing with data:', cardFormData);
                                    
                                    await signUpAndCreateOrganization(email, password, orgName, plan.id as 'basic' | 'professional');
                                    
                                    alert('Pagamento processado e organização criada com sucesso! Você será redirecionado para a tela de login.');
                                    navigate('/admin/login');

                                } catch (err: any) {
                                    setError(err.message || 'Ocorreu um erro ao criar sua conta após o pagamento. Nenhum valor foi cobrado.');
                                    setIsProcessing(false);
                                }
                            },
                            onError: (error: any) => {
                                console.error(error);
                                setError("Ocorreu um erro com o formulário de pagamento. Verifique seus dados.");
                                setIsLoading(false);
                                setIsProcessing(false);
                            },
                        },
                    };
                    cardPaymentBrickController.current = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', settings);
                };
                
                await renderCardPaymentBrick(bricksBuilder);

            } catch (err: any) {
                setError(err.message || "Não foi possível iniciar o checkout.");
                setIsLoading(false);
            }
        };

        if (plan) {
            initializeMercadoPago();
        }

        // Cleanup function to unmount the brick
        return () => {
            if (cardPaymentBrickController.current) {
                try {
                  cardPaymentBrickController.current.unmount();
                } catch (e) {
                  console.error("Error unmounting brick: ", e);
                }
            }
        }
    }, [plan, email, password, orgName, navigate]);
    
    if (!plan || !orgName || !email || !password) {
        // This handles cases where the user navigates directly to /checkout
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
                    <div className="absolute inset-0 bg-secondary bg-opacity-80 flex flex-col justify-center items-center rounded-lg z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="mt-4 text-gray-300">{isProcessing ? 'Processando pagamento...' : 'Carregando checkout...'}</p>
                    </div>
                )}
                <h1 className="text-3xl font-bold text-center text-white mb-2">Pagamento Seguro</h1>
                <p className="text-center text-gray-400 mb-6">Plano {plan.name} - {plan.priceFormatted}/mês</p>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
                
                {/* The Mercado Pago Brick will be rendered here */}
                <div id="cardPaymentBrick_container"></div>

                <div className="text-center mt-4">
                     <Link to="/planos" className="inline-block text-sm text-gray-400 hover:text-white">
                        Cancelar e voltar
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default MockCheckoutPage;
