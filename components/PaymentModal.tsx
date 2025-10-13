import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plan } from '../pages/PricingPage';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan }) => {
  const navigate = useNavigate();

  // Form State
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setOrgName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
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
    
    // Base64 encode password to safely pass in URL
    const passwordB64 = btoa(password);

    // Navigate to the dedicated checkout page with all the info
    navigate(`/checkout/${plan.id}/${encodeURIComponent(orgName)}/${encodeURIComponent(email)}/${passwordB64}`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-secondary rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
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
      </div>
    </div>
  );
};

export default PaymentModal;