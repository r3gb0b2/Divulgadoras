import React, { useState, useEffect } from 'react';
import { Plan } from '../pages/PricingPage';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan }) => {
  // Form State
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOrgName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setTaxId('');
      setPhone('');
      setError('');
      setIsProcessing(false);
    }
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const handleFormSubmit = async (e: React.FormEvent) => {
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
    
    setIsProcessing(true);

    try {
        const initiateCheckout = httpsCallable(functions, 'initiatePagSeguroCheckout');
        const passwordB64 = btoa(password);

        const result: any = await initiateCheckout({
            planId: plan.id,
            orgName,
            email,
            passwordB64,
            taxId,
            phone
        });
        
        if (result.data.checkoutUrl) {
            // Redirect user to PagSeguro's payment page
            window.location.href = result.data.checkoutUrl;
        } else {
            throw new Error("Não foi possível obter o link de pagamento.");
        }

    } catch (err: any) {
        console.error("Error initiating checkout:", err);
        setError(err.message || 'Ocorreu um erro ao iniciar o processo de pagamento.');
        setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-secondary rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 relative">
            {isProcessing && (
                <div className="absolute inset-0 bg-secondary bg-opacity-90 flex flex-col justify-center items-center rounded-lg z-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p className="mt-4 text-gray-300">Redirecionando para o pagamento...</p>
                </div>
            )}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Plano {plan.name} - {plan.priceFormatted}/mês</h2>
                <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
            </div>
            
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-4 text-center">{error}</p>}
            
            <h3 className="font-semibold text-lg text-gray-200">Crie sua Conta para Continuar</h3>
            <div>
                <label className="text-sm font-medium text-gray-400">Nome da Empresa / Evento</label>
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
            </div>
             <div>
                <label className="text-sm font-medium text-gray-400">Seu E-mail de Acesso</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
            </div>
            <div>
                <label className="text-sm font-medium text-gray-400">CPF ou CNPJ</label>
                <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} required placeholder="Apenas números" className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
            </div>
            <div>
                <label className="text-sm font-medium text-gray-400">Telefone com DDD</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="Ex: 11987654321" className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
            </div>
             <div>
                <label className="text-sm font-medium text-gray-400">Crie uma Senha</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
            </div>
            <div>
                <label className="text-sm font-medium text-gray-400">Confirme a Senha</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
            </div>
            <button type="submit" disabled={isProcessing} className="w-full py-3 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50">
                {isProcessing ? 'Aguarde...' : 'Continuar para Pagamento'}
            </button>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;