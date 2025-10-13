import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signUpAndCreateOrganization } from '../services/adminService';
import { Plan } from './PricingPage';
import { MercadoPagoIcon, LockClosedIcon } from '../components/Icons';

const MockCheckoutPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { plan, orgName, email, password } = (location.state || {}) as {
        plan: Plan;
        orgName: string;
        email: string;
        password: string;
    };

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    if (!plan || !orgName || !email || !password) {
        return (
            <div className="text-center py-10">
                <h1 className="text-2xl font-bold text-red-400">Erro: Informações da assinatura ausentes.</h1>
                <p className="text-gray-400 mt-2">Por favor, volte para a página de planos e inicie o processo novamente.</p>
            </div>
        );
    }
    
    const handleConfirmPayment = async () => {
        setIsLoading(true);
        setError('');
        try {
            await signUpAndCreateOrganization(email, password, orgName, plan.id as 'basic' | 'professional');
            alert('Pagamento confirmado e organização criada com sucesso! Você será redirecionado para a tela de login.');
            navigate('/admin/login');
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao criar sua organização. Nenhum valor foi cobrado.');
            setIsLoading(false);
        }
    };


    return (
        <div className="max-w-md mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <div className="text-center mb-6">
                    <MercadoPagoIcon className="mx-auto h-8 w-auto text-white mb-4" />
                    <h1 className="text-xl font-bold text-white">Simulação de Checkout</h1>
                    <p className="text-sm text-gray-400">Esta é uma página de simulação de pagamento.</p>
                </div>

                <div className="bg-gray-700/50 p-4 rounded-lg space-y-3 mb-6">
                     <div className="flex justify-between items-center text-gray-300">
                        <span>Organização:</span>
                        <span className="font-semibold text-white">{orgName}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-300">
                        <span>Plano:</span>
                        <span className="font-semibold text-white">{plan.name}</span>
                    </div>
                     <div className="flex justify-between items-center text-2xl font-bold text-primary border-t border-gray-600 pt-3 mt-3">
                        <span>Total:</span>
                        <span>{plan.priceFormatted}<span className="text-base font-medium text-gray-400">/mês</span></span>
                    </div>
                </div>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
                
                <button
                    onClick={handleConfirmPayment}
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                    {isLoading ? 'Processando...' : 'Confirmar Pagamento (Simulação)'}
                </button>
                 <p className="text-xs text-gray-500 text-center mt-4">
                    <LockClosedIcon className="w-3 h-3 inline-block mr-1"/>
                    Em um ambiente real, você estaria em um checkout seguro do Mercado Pago.
                 </p>
            </div>
        </div>
    );
};

export default MockCheckoutPage;