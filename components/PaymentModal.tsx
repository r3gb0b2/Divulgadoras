import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plan } from '../pages/PricingPage';
import { signUpAndCreateOrganization } from '../services/adminService';
import { MailIcon, LockClosedIcon, UserIcon, VisaIcon, MastercardIcon, CreditCardIcon } from './Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
}

// Helper to detect card type
const getCardType = (cardNumber: string): 'visa' | 'mastercard' | 'unknown' => {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned)) return 'mastercard';
    return 'unknown';
};

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan }) => {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  // Form State
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardType, setCardType] = useState<'visa' | 'mastercard' | 'unknown'>('unknown');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Reset form when modal opens or plan changes
    if (isOpen) {
      setStep(1);
      setOrgName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setCardNumber('');
      setCardExpiry('');
      setCardCvc('');
      setCardType('unknown');
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

    // --- Enhanced Validation ---
    if (cardNumber.replace(/\s/g, '').length < 16) {
        setError('Número do cartão de crédito inválido.');
        return;
    }
    const expiryParts = cardExpiry.split(' / ');
    if (expiryParts.length !== 2 || expiryParts[0].length !== 2 || expiryParts[1].length !== 2) {
        setError('Data de validade inválida. Use o formato MM / AA.');
        return;
    }
    const month = parseInt(expiryParts[0], 10);
    const year = parseInt(expiryParts[1], 10);
    const currentYear = new Date().getFullYear() % 100;
    const currentMonth = new Date().getMonth() + 1;

    if (month < 1 || month > 12) {
        setError('O mês na data de validade é inválido.');
        return;
    }
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
        setError('Este cartão de crédito está expirado.');
        return;
    }
    if (cardCvc.length < 3) {
        setError('O código CVC é inválido.');
        return;
    }
    // --- End Validation ---

    setIsLoading(true);
    
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      // On successful "payment", create the organization
      await signUpAndCreateOrganization(email, password, orgName, plan.id as 'basic' | 'professional');
      alert('Inscrição realizada com sucesso! Sua organização foi criada. Você será redirecionado para a tela de login.');
      onClose();
      navigate('/admin');
    } catch (err: any) {
      // If organization creation fails, show error and potentially go back to step 1
      setError(err.message || 'Ocorreu um erro ao criar sua organização.');
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };
  
  const formatCardNumber = (value: string) => {
    return value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }
  
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
    setCardType(getCardType(formatted));
  };


  const formatExpiry = (value: string) => {
    return value.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 / ').trim();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-secondary rounded-lg shadow-xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>
        {isLoading && (
            <div className="absolute inset-0 bg-secondary bg-opacity-80 flex flex-col justify-center items-center rounded-lg z-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="mt-4 text-gray-300">Processando sua inscrição...</p>
            </div>
        )}
        
        <div className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Plano {plan.name}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-md mb-6">
                <span className="font-semibold text-gray-300">Total Mensal</span>
                <span className="text-2xl font-bold text-primary">{plan.priceFormatted}</span>
            </div>

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
                     <h3 className="font-semibold text-lg text-gray-200">2. Informações de Pagamento</h3>
                     <div className="p-3 bg-gray-700/50 rounded-md">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Cartão de Crédito</label>
                        <div className="relative">
                            <input type="text" value={cardNumber} onChange={handleCardNumberChange} maxLength={19} placeholder="0000 0000 0000 0000" required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"/>
                             <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <VisaIcon className={`w-8 transition-opacity ${cardType === 'visa' || cardType === 'unknown' ? 'opacity-100' : 'opacity-30'}`}/>
                                <MastercardIcon className={`w-8 transition-opacity ${cardType === 'mastercard' || cardType === 'unknown' ? 'opacity-100' : 'opacity-30'}`}/>
                            </div>
                        </div>
                        <div className="flex gap-4 mt-3">
                             <input type="text" value={cardExpiry} onChange={e => setCardExpiry(formatExpiry(e.target.value))} maxLength={7} placeholder="MM / AA" required className="w-1/2 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"/>
                             <input type="text" value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g, ''))} maxLength={4} placeholder="CVC" required className="w-1/2 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"/>
                        </div>
                     </div>
                     <p className="text-xs text-gray-500 text-center">
                        <LockClosedIcon className="w-3 h-3 inline-block mr-1"/>
                        Pagamento seguro. Você pode cancelar a qualquer momento.
                     </p>
                     <div className="flex gap-2">
                        <button type="button" onClick={() => setStep(1)} className="w-1/3 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-500 font-semibold text-sm">Voltar</button>
                        <button type="submit" className="w-2/3 py-3 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold">
                            Assinar e Pagar {plan.priceFormatted}
                        </button>
                     </div>
                </form>
            )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;