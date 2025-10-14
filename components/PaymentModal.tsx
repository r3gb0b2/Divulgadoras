import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { Organization } from '../types';
import { plans } from '../pages/PricingPage';
import { MercadoPagoIcon } from './Icons';

const FinishPaymentPage: React.FC = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAdminAuth();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
        navigate('/admin/login');
        return;
    }
    if (!orgId) {
        navigate('/planos');
        return;
    }

    const fetchOrg = async () => {
        setIsLoading(true);
        try {
            const orgData = await getOrganization(orgId);
            if (!orgData) throw new Error("Organização não encontrada.");
            if (orgData.ownerUid !== user.uid) {
                // Security check
                throw new Error("Você não tem permissão para acessar esta página.");
            }
            setOrganization(orgData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchOrg();

  }, [orgId, user, authLoading, navigate]);
  
  const handlePayment = async () => {
    setError('');
    setIsLoading(true);
    try {
        if (!orgId) throw new Error("ID da organização não encontrado.");

        const getCheckoutLink = httpsCallable(functions, 'getCheckoutLinkForOrg');
        const result: any = await getCheckoutLink({ orgId });

        if (result.data && result.data.checkoutUrl) {
            window.location.href = result.data.checkoutUrl;
        } else {
            throw new Error("Não foi possível obter o link de pagamento.");
        }
    } catch (err: any) {
        console.error("Error getting checkout link:", err);
        setError(err.message || "Ocorreu um erro ao tentar gerar o link de pagamento.");
        setIsLoading(false);
    }
  };

  const plan = organization ? plans.find(p => p.id === organization.planId) : null;

  if (isLoading || authLoading) {
    return (
        <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
        <div className="bg-secondary shadow-2xl rounded-lg p-8 relative">
             {isLoading && (
                <div className="absolute inset-0 bg-secondary bg-opacity-95 flex flex-col justify-center items-center rounded-lg z-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p className="mt-4 text-gray-300 font-semibold">Aguarde...</p>
                </div>
            )}
            
            <h1 className="text-3xl font-bold text-white mb-2">Sua conta foi criada!</h1>
            {organization && <p className="text-gray-400">Bem-vindo(a), <span className="font-bold text-gray-200">{organization.name}</span>!</p>}
            
            <div className="my-8 p-6 border-2 border-gray-700 rounded-lg bg-dark">
                <h2 className="text-xl font-semibold text-gray-200">Último passo: Ative seu plano</h2>
                {plan && (
                    <p className="mt-2 text-primary text-2xl font-bold">
                        {plan.name} - {plan.priceFormatted}<span className="text-lg font-medium text-gray-400">/mês</span>
                    </p>
                )}
            </div>
            
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm mb-6">{error}</p>}

            <button
                onClick={handlePayment}
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
            >
                <MercadoPagoIcon className="w-8 h-8" />
                {isLoading ? 'Gerando link...' : 'Ativar Plano e Pagar'}
            </button>

            <p className="text-xs text-gray-500 text-center mt-4">
                Você será redirecionado para o ambiente seguro do Mercado Pago para finalizar a assinatura.
            </p>
        </div>
    </div>
  );
};

export default FinishPaymentPage;
