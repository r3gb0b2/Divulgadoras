import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { signUpAndCreateOrganization } from '../services/adminService';
import { Plan } from './PricingPage';
import { MercadoPagoIcon } from '../components/Icons';

const MockCheckoutPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { plan, orgName, email, password } = (location.state as { plan: Plan; orgName: string; email: string; password: string }) || {};

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    if (!plan || !orgName || !email || !password) {
        return (
            <div className="max-w-md mx-auto text-center bg-secondary p-8 rounded-lg">
                <h1 className="text-2xl font-bold text-red-400">Erro</h1>
                <p className="text-gray-300 mt-4">Informações do plano ou da conta ausentes. Por favor, volte e tente novamente.</p>
                <Link to="/planos" className="inline-block mt-6 px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">
                    Voltar aos Planos
                </Link>
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
            setError(err.message || 'Ocorreu um erro ao processar seu cadastro. Nenhum valor foi cobrado.');
            setIsLoading(false);
        }
    };
    
    return (
        <div className="max-w-lg mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8 relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-secondary bg-opacity-80 flex flex-col justify-center items-center rounded-lg z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="mt-4 text-gray-300">Finalizando seu cadastro...</p>
                    </div>
                )}
                <h1 className="text-3xl font-bold text-center text-white mb-4">Finalizar Assinatura</h1>
                <p className="text-center text-gray-400 mb-6">Revise os detalhes e confirme o pagamento para ativar sua conta.</p>

                <div className="space-y-4 mb-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300">Organização:</span>
                        <span className="font-semibold text-white">{orgName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300">E-mail de Acesso:</span>
                        <span className="font-semibold text-white">{email}</span>
                    </div>
                    <div className="border-t border-gray-700 my-2"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300">Plano Selecionado:</span>
                        <span className="font-semibold text-primary">{plan.name}</span>
                    </div>
                     <div className="flex justify-between items-center text-2xl">
                        <span className="text-gray-300">Total:</span>
                        <span className="font-bold text-white">{plan.priceFormatted}<span className="text-base font-medium text-gray-400">/mês</span></span>
                    </div>
                </div>
                
                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
                
                <div className="text-center">
                    <p className="text-sm text-gray-400 mb-4">
                        Esta é uma página de demonstração. Clicar no botão abaixo irá simular um pagamento bem-sucedido e criar sua conta.
                    </p>
                    <button
                        onClick={handleConfirmPayment}
                        disabled={isLoading}
                        className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed"
                    >
                         <MercadoPagoIcon className="mr-3" />
                        Confirmar Pagamento e Criar Conta
                    </button>
                    <Link to="/planos" className="inline-block mt-4 text-sm text-gray-400 hover:text-white">
                        Cancelar e voltar
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default MockCheckoutPage;
