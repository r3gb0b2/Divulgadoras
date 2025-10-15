import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { createPagSeguroOrder } from '../services/credentialsService';
import { Organization, OrganizationStatus } from '../types';
import { plans, Plan } from './PricingPage'; // Import plans array
import { Timestamp } from 'firebase/firestore';
import { CreditCardIcon, WhatsAppIcon, ArrowLeftIcon, PagSeguroIcon } from '../components/Icons';

const SubscriptionPage: React.FC = () => {
    const { adminData } = useAdminAuth();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const [isCreatingOrder, setIsCreatingOrder] = useState(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            if (adminData?.organizationId) {
                try {
                    const orgData = await getOrganization(adminData.organizationId);
                    if (orgData) {
                        setOrganization(orgData);
                    } else {
                        setError("Não foi possível encontrar os dados da sua organização.");
                    }
                } catch (err) {
                    setError("Erro ao carregar os dados da assinatura.");
                }
            } else {
                setError("Você não está associado a uma organização.");
            }
            setIsLoading(false);
        };

        fetchInitialData();
    }, [adminData]);
    
    const handlePayment = async () => {
        if (!organization || !organization.planId) return;

        setIsCreatingOrder(true);
        setError(null);
        
        try {
            const { payLink } = await createPagSeguroOrder(organization.id, organization.planId);
            if (payLink) {
                window.location.href = payLink;
            } else {
                throw new Error("O link de pagamento não foi retornado pelo servidor.");
            }
        } catch (err: any) {
            setError(err.message || "Não foi possível iniciar o pagamento.");
            setIsCreatingOrder(false);
        }
    };


    const getStatusBadge = (status: OrganizationStatus | undefined) => {
        if (!status) return null;
        const styles: Record<OrganizationStatus, string> = {
            active: "bg-green-900/50 text-green-300",
            trial: "bg-blue-900/50 text-blue-300",
            expired: "bg-red-900/50 text-red-300",
            hidden: "bg-gray-700 text-gray-400",
        };
        const text: Record<OrganizationStatus, string> = {
            active: "Ativa",
            trial: "Teste",
            expired: "Expirada",
            hidden: "Oculta",
        };
        return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    const formatDate = (timestamp: Timestamp | undefined) => {
        if (!timestamp) return 'Indefinida';
        return timestamp.toDate().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    };
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    if (!organization) {
         return <p className="text-gray-400 text-center">Nenhuma informação de assinatura encontrada.</p>;
    }

    const currentPlan: Plan | undefined = plans.find(p => p.id === organization.planId);
    const isExpired = organization.status === 'expired' || (organization.planExpiresAt && (organization.planExpiresAt as Timestamp).toDate() < new Date());

    return (
        <div>
            <div className="mb-6">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar para Configurações</span>
                </button>
                <h1 className="text-3xl font-bold mt-1">Gerenciar Assinatura</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="bg-secondary p-6 rounded-lg shadow">
                        <h3 className="text-xl font-semibold mb-4 text-white">Seu Plano Atual</h3>
                        <div className="space-y-3 text-gray-300">
                           <div className="flex justify-between"><span>Plano:</span> <span className="font-semibold text-primary">{currentPlan?.name || 'N/A'}</span></div>
                           <div className="flex justify-between"><span>Preço:</span> <span className="font-semibold">{currentPlan?.priceFormatted ? `${currentPlan.priceFormatted}/mês` : 'N/A'}</span></div>
                           <div className="flex justify-between items-center">
                               <span>Status:</span> 
                               {getStatusBadge(organization.status)}
                           </div>
                           <div className="flex justify-between"><span>Expira em:</span> <span className="font-semibold">{formatDate(organization.planExpiresAt as Timestamp)}</span></div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                     <div className="bg-secondary p-6 rounded-lg shadow">
                        <h3 className="text-xl font-semibold mb-4 text-white">Pagamento e Renovação</h3>
                        {isExpired && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 mb-4 rounded-md text-sm">
                                <p className="font-bold">Seu plano expirou!</p>
                                <p>Para reativar sua conta e não perder seus dados, realize o pagamento.</p>
                            </div>
                        )}
                        <p className="text-gray-400 mb-4">
                           Para renovar ou reativar seu plano, clique no botão abaixo para pagar com PagSeguro.
                        </p>
                        
                        <button 
                            onClick={handlePayment}
                            disabled={isCreatingOrder}
                            className="w-full flex items-center justify-center mt-4 px-4 py-3 bg-[#FFC72C] text-black rounded-md hover:bg-[#ffb700] text-sm font-bold disabled:opacity-50"
                        >
                            <PagSeguroIcon className="w-6 h-auto mr-2" />
                            {isCreatingOrder ? 'Gerando pagamento...' : `Pagar ${currentPlan?.priceFormatted} com PagSeguro`}
                        </button>

                        {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionPage;