import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { Organization, OrganizationStatus } from '../types';
import { plans, Plan } from './PricingPage'; // Import plans array
import { Timestamp } from 'firebase/firestore';
import { CreditCardIcon, WhatsAppIcon } from '../components/Icons';

const SubscriptionPage: React.FC = () => {
    const { adminData } = useAdminAuth();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrgData = async () => {
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

        fetchOrgData();
    }, [adminData]);
    
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
    
    if (error) {
        return <p className="text-red-400 text-center bg-red-900/50 p-4 rounded-md">{error}</p>;
    }

    if (!organization) {
         return <p className="text-gray-400 text-center">Nenhuma informação de assinatura encontrada.</p>;
    }

    const currentPlan: Plan | undefined = plans.find(p => p.id === organization.planId);

    return (
        <div>
            <div className="mb-6">
                <Link to="/admin/settings" className="text-sm text-primary hover:underline">&larr; Voltar para Configurações</Link>
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
                        {organization.planExpiresAt && (organization.planExpiresAt as Timestamp).toDate() < new Date() && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 mb-4 rounded-md text-sm">
                                <p className="font-bold">Seu plano expirou!</p>
                                <p>Para reativar sua conta e não perder seus dados, realize o pagamento.</p>
                            </div>
                        )}
                        <p className="text-gray-400 mb-4">
                           Para renovar ou reativar seu plano, utilize o link de pagamento fornecido pelo nosso suporte.
                        </p>
                        
                        {organization.paymentLink ? (
                             <a 
                                href={organization.paymentLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-center mt-4 px-4 py-3 bg-primary text-white rounded-md hover:bg-primary-dark text-sm font-semibold"
                            >
                                <WhatsAppIcon className="w-5 h-5 mr-2" />
                                Realizar Pagamento Agora
                            </a>
                        ) : (
                            <div className="text-center p-4 bg-gray-700/50 rounded-md text-gray-400">
                                Nenhum link de pagamento configurado. Entre em contato com o suporte.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionPage;
