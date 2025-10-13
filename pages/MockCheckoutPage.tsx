import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { getMercadoPagoCredentials } from '../services/credentialsService';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Plan } from './PricingPage';

// This is a global variable from the Mercado Pago script
declare global {
    interface Window {
        MercadoPago: any;
    }
}

const CheckoutPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { plan, orgName, email, password } = (location.state as { plan: Plan; orgName: string; email: string; password: string }) || {};

    const cardPaymentBrickController = useRef<any>(null);
    const pixPollingInterval = useRef<number | null>(null);

    const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix' | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');

    // PIX specific state
    const [pixData, setPixData] = useState<{ qrCodeBase64: string; qrCode: string; paymentId: number } | null>(null);
    const [isWaitingForPix, setIsWaitingForPix] = useState(false);


    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            if (cardPaymentBrickController.current) {
                try {
                  cardPaymentBrickController.current.unmount();
                } catch (e) { console.error("Error unmounting brick: ", e); }
            }
            if (pixPollingInterval.current) {
                clearInterval(pixPollingInterval.current);
            }
        };
    }, []);

    const initializeCardPayment = async () => {
        setIsLoading(true);
        setError('');
        try {
            const creds = await getMercadoPagoCredentials();
            if (!creds.publicKey) throw new Error("A chave pública do Mercado Pago não foi configurada.");

            const mp = new window.MercadoPago(creds.publicKey);
            const bricksBuilder = mp.bricks();
            
            if (cardPaymentBrickController.current) {
                cardPaymentBrickController.current.unmount();
            }

            const settings = {
                initialization: { amount: plan.price, payer: { email } },
                customization: { visual: { style: { theme: 'dark' } } },
                callbacks: {
                    onReady: () => setIsLoading(false),
                    onSubmit: async (cardFormData: any) => {
                        setIsProcessing(true);
                        setError('');
                        try {
                            const paymentData = {
                                transaction_amount: cardFormData.transaction_amount,
                                token: cardFormData.token,
                                description: `Assinatura Plano ${plan.name} - ${orgName}`,
                                installments: cardFormData.installments,
                                payment_method_id: cardFormData.payment_method_id,
                                issuer_id: cardFormData.issuer_id,
                                payer: { email: cardFormData.payer.email },
                            };
                            const newUser = { email, password, orgName, planId: plan.id };
                            const processPayment = httpsCallable(functions, 'processMercadoPagoPayment');
                            const result = await processPayment({ paymentData, newUser });
                            const data = result.data as { success: boolean; message?: string };

                            if (data.success) {
                                alert('Pagamento processado e organização criada com sucesso! Você será redirecionado para a tela de login.');
                                navigate('/admin/login');
                            } else {
                                throw new Error(data.message || 'Ocorreu um erro desconhecido.');
                            }
                        } catch (err: any) {
                            setError(err.message || 'Ocorreu um erro ao processar o pagamento. Nenhum valor foi cobrado.');
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
        } catch (err: any) {
            setError(err.message || "Não foi possível iniciar o checkout com cartão.");
            setIsLoading(false);
        }
    };
    
    const handleSelectPaymentMethod = (method: 'card' | 'pix') => {
        setPaymentMethod(method);
        setError('');
        setPixData(null);
        if (method === 'card') {
            initializeCardPayment();
        } else if (method === 'pix') {
             if (cardPaymentBrickController.current) {
                cardPaymentBrickController.current.unmount();
            }
            handlePixPayment();
        }
    }

    const handlePixPayment = async () => {
        setIsProcessing(true);
        setError('');
        try {
            const newUser = { email, password, orgName, planId: plan.id };
            const createPix = httpsCallable(functions, 'createPixPayment');
            const result = await createPix({ plan, newUser });
            const data = result.data as any;

            if (data.success) {
                setPixData({
                    qrCodeBase64: data.qrCodeBase64,
                    qrCode: data.qrCode,
                    paymentId: data.paymentId,
                });
                setIsWaitingForPix(true);
                startPixPolling(data.paymentId);
            } else {
                throw new Error(data.message || 'Falha ao gerar o código PIX.');
            }
        } catch(err: any) {
             setError(err.message || 'Ocorreu um erro ao gerar o PIX.');
        } finally {
            setIsProcessing(false);
        }
    };
    
    const startPixPolling = (paymentId: number) => {
        if (pixPollingInterval.current) clearInterval(pixPollingInterval.current);
        
        pixPollingInterval.current = window.setInterval(async () => {
            try {
                const checkStatus = httpsCallable(functions, 'checkPixPaymentStatus');
                const result = await checkStatus({ paymentId });
                const data = result.data as { status: string, message?: string };
                
                if (data.status === 'approved') {
                    if (pixPollingInterval.current) clearInterval(pixPollingInterval.current);
                    setIsWaitingForPix(false);
                    alert('Pagamento PIX confirmado e organização criada com sucesso! Você será redirecionado para a tela de login.');
                    navigate('/admin/login');
                } else if (data.status === 'cancelled' || data.status === 'expired') {
                    if (pixPollingInterval.current) clearInterval(pixPollingInterval.current);
                    setError(data.message || 'O pagamento PIX expirou ou foi cancelado. Por favor, gere um novo.');
                    setIsWaitingForPix(false);
                    setPixData(null);
                    setPaymentMethod(null);
                }
                // If status is 'pending', do nothing and wait for the next poll
            } catch (err: any) {
                if (pixPollingInterval.current) clearInterval(pixPollingInterval.current);
                setError(err.message || 'Erro ao verificar o status do pagamento.');
                setIsWaitingForPix(false);
            }
        }, 5000); // Poll every 5 seconds
    }
    
    const copyToClipboard = () => {
        if(pixData?.qrCode) {
            navigator.clipboard.writeText(pixData.qrCode);
            alert("Código PIX copiado para a área de transferência!");
        }
    }

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
                 {(isLoading || isProcessing || isWaitingForPix) && (
                    <div className="absolute inset-0 bg-secondary bg-opacity-90 flex flex-col justify-center items-center rounded-lg z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="mt-4 text-gray-300 text-center px-4">
                            {isProcessing ? 'Processando...' : 
                             isWaitingForPix ? 'Aguardando pagamento PIX...' : 
                             'Carregando...'}
                        </p>
                    </div>
                )}
                <h1 className="text-3xl font-bold text-center text-white mb-2">Pagamento Seguro</h1>
                <p className="text-center text-gray-400 mb-6">Plano {plan.name} - {plan.priceFormatted}/mês</p>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
                
                {!paymentMethod && (
                     <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-center text-gray-200">Escolha a forma de pagamento</h2>
                        <button onClick={() => handleSelectPaymentMethod('card')} className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">
                            Cartão de Crédito
                        </button>
                        <button onClick={() => handleSelectPaymentMethod('pix')} className="w-full py-3 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 font-semibold">
                            Pagar com PIX
                        </button>
                    </div>
                )}

                {paymentMethod === 'card' && <div id="cardPaymentBrick_container"></div>}
                
                {paymentMethod === 'pix' && pixData && (
                    <div className="text-center space-y-4">
                        <h2 className="text-lg font-semibold text-white">Pague com PIX para finalizar</h2>
                        <p className="text-sm text-gray-400">Escaneie o QR Code abaixo com o app do seu banco.</p>
                        <div className="flex justify-center">
                            <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="PIX QR Code" className="rounded-lg border-4 border-white" />
                        </div>
                        <p className="text-sm text-gray-400">Ou use o PIX Copia e Cola:</p>
                        <button onClick={copyToClipboard} className="w-full py-3 bg-gray-700 text-white rounded-md hover:bg-gray-600 font-semibold">
                            Copiar Código PIX
                        </button>
                    </div>
                )}

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