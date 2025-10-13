import React, { useState, useEffect } from 'react';
import { Plan } from '../pages/PricingPage';
import { LockClosedIcon, MercadoPagoIcon } from './Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan }) => {
  const [step, setStep] = useState(1);

  // Form State
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processando...');

  useEffect(() => {
    // Reset form when modal opens or plan changes
    if (isOpen) {
      setStep(1);
      setOrgName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError('');
      setIsLoading(false);
    }
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setStep(2);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // --- DEVELOPER NOTE ---
    // This is where the real Mercado Pago integration would happen.
    // 1. Send user details (email, orgName, plan.id) to your backend.
    // 2. Your backend uses the Mercado Pago SDK to create a "payment preference".
    // 3. Mercado Pago returns a checkout URL (init_point).
    // 4. Your backend sends this URL back to the frontend.
    // 5. The frontend redirects the user: window.location.href = init_point;
    // 6. After successful payment, a webhook from Mercado Pago to your backend
    //    triggers the signUpAndCreateOrganization function.

    // --- SIMULATION ---
    // We will simulate this process with a delay and a message.
    setLoadingMessage('Redirecionando para o checkout seguro...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    // After the simulated redirect, we show what would happen next.
    setIsLoading(false);
    setStep(3); // A new confirmation step.
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-secondary rounded-lg shadow-xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>
        {isLoading && (
            <div className="absolute inset-0 bg-secondary bg-opacity-80 flex flex-col justify-center items-center rounded-lg z-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="mt-4 text-gray-300">{loadingMessage}</p>
            </div>
        )}
        
        <div className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Plano {plan.name}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
            </div>
            
            {step < 3 && (
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-md mb-6">
                  <span className="font-semibold text-gray-300">Total Mensal</span>
                  <span className="text-2xl font-bold text-primary">{plan.priceFormatted}</span>
              </div>
            )}

            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
            
            {/* Step 1: Account Info */}
            {step === 1 && (
                <form onSubmit={handleAccountSubmit} className="space-y-4">
                    <h3 className="font-semibold text-lg text-gray-200">1. Crie sua Conta</h3>
                    <div>
                        <label className="text-sm font-medium text-gray-400">Nome da Empresa / Evento</label>
                        <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                     <div>
                        <label className="text-sm font-medium text-gray-400">Seu E-mail de Acesso</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                     <div>
                        <label className="text-sm font-medium text-gray-400">Crie uma Senha</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-400">Confirme a Senha</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                    <button type="submit" className="w-full py-3 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold">
                        Continuar para Pagamento
                    </button>
                </form>
            )}

            {/* Step 2: Payment Info */}
            {step === 2 && (
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                     <h3 className="font-semibold text-lg text-gray-200">2. Pagamento</h3>
                     <div className="p-4 bg-gray-700/50 rounded-md text-center">
                        <p className="text-gray-300">Você será redirecionado para o ambiente seguro do Mercado Pago para finalizar sua assinatura.</p>
                     </div>
                     <p className="text-xs text-gray-500 text-center">
                        <LockClosedIcon className="w-3 h-3 inline-block mr-1"/>
                        Pagamento seguro. Você pode cancelar a qualquer momento.
                     </p>
                     <div className="flex flex-col gap-2">
                        <button type="submit" className="w-full py-3 bg-[#009EE3] text-white rounded-md hover:bg-[#0089CC] font-semibold flex items-center justify-center">
                            <MercadoPagoIcon className="mr-2" />
                            Pagar com Mercado Pago
                        </button>
                        <button type="button" onClick={() => setStep(1)} className="w-full py-2 bg-transparent text-gray-400 rounded-md hover:text-white font-semibold text-sm">Voltar</button>
                     </div>
                </form>
            )}

            {/* Step 3: Confirmation Simulation */}
            {step === 3 && (
                <div className="text-center space-y-4 p-4">
                    <h3 className="font-semibold text-xl text-green-400">Quase lá!</h3>
                    <p className="text-gray-300">
                        Em um ambiente real, você seria redirecionado para a página de pagamento segura do Mercado Pago.
                    </p>
                    <p className="text-gray-300">
                        Após a confirmação do pagamento, sua organização e conta seriam criadas, e você receberia um e-mail de boas-vindas com instruções para o primeiro acesso.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-3 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold"
                    >
                        Entendido
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;