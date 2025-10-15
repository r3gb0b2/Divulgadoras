
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { Organization } from '../types';
import { Timestamp } from 'firebase/firestore';
import { plans } from './PricingPage';
import { ArrowLeftIcon } from '../components/Icons';

const SubscriptionPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchOrg = async () => {
            if (adminData?.organizationId) {
                try {
                    const orgData = await getOrganization(adminData.organizationId);
                    setOrganization(orgData);
                } catch (err: any) {
                    setError(err.message || 'Falha ao carregar dados da organização.');
                }
            } else if (!adminData) {
                 setError("Dados do administrador não encontrados.");
            } else {
                 setError("Este administrador não está vinculado a uma organização.");
            }
            setIsLoading(false);
        };
        fetchOrg();
    }, [adminData]);
    
    const formatDate = (timestamp?: Timestamp) => {
        if (!timestamp) return 'N/A';
        return timestamp.toDate().toLocaleDateString('pt-BR');
    };
    
    const planDetails = organization ? plans.find(p => p.id === organization.planId) : null;

    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center">Carregando...</div>;
        }
        if (error) {
            return <div className="text-center text-red-400">{error}</div>;
        }
        if (!organization || !planDetails) {
            return <div className="text-center text-gray-400">Não foi possível carregar os detalhes da sua assinatura.</div>;
        }

        const isExpired = organization.planExpiresAt && organization.planExpiresAt.toDate() < new Date();

        return (
            <div className="bg-gray-700/50 p-6 rounded-lg">
                <h2 className="text-2xl font-bold text-white mb-4">Seu Plano Atual</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className="text-gray-400 text-sm">Plano</p>
                        <p className="text-xl font-semibold text-primary">{planDetails.name}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-sm">Status</p>
                        <p className={`text-xl font-semibold ${isExpired ? 'text-red-400' : 'text-green-400'}`}>
                            {organization.status === 'trial' ? 'Em Teste' : isExpired ? 'Expirado' : 'Ativo'}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-sm">Preço</p>
                        <p className="text-xl font-semibold text-white">{planDetails.priceFormatted} / mês</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-sm">Válido até</p>
                        <p className="text-xl font-semibold text-white">{formatDate(organization.planExpiresAt)}</p>
                    </div>
                </div>

                <div className="mt-8 border-t border-gray-600 pt-6">
                    <h3 className="text-lg font-semibold text-white mb-2">Gerenciar Assinatura</h3>
                    <p className="text-gray-400 text-sm mb-4">No momento, o gerenciamento de assinaturas (troca de plano, cancelamento, etc.) é feito através do nosso suporte.</p>
                    <a href="#" className="inline-block px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark">
                        Falar com o Suporte
                    </a>
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciar Assinatura</h1>
                 <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
             <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
             </div>
        </div>
    );
};

export default SubscriptionPage;
