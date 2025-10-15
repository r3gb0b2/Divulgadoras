import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization, updateOrganization } from '../services/organizationService';
import { createPagSeguroOrder } from '../services/credentialsService';
import { Organization } from '../types';
import { Timestamp } from 'firebase/firestore';
import { plans } from './PricingPage';
import { ArrowLeftIcon, CreditCardIcon, UserIcon, PhoneIcon } from '../components/Icons';

// Reusable Input component from other pages
const InputWithIcon: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { Icon: React.ElementType }> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200" />
    </div>
);

const SubscriptionPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [isSavingInfo, setIsSavingInfo] = useState(false);
    const [error, setError] = useState('');
    
    // State for missing info form
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');
    const [taxId, setTaxId] = useState('');

    const fetchOrg = async () => {
        if (adminData?.organizationId) {
            setIsLoading(true);
            try {
                const orgData = await getOrganization(adminData.organizationId);
                setOrganization(orgData);
                if (orgData) {
                    // Pre-fill form if data exists
                    if (orgData.ownerName) setOwnerName(orgData.ownerName);
                    if (orgData.ownerPhone) setPhone(orgData.ownerPhone);
                    if (orgData.ownerTaxId) setTaxId(orgData.ownerTaxId);
                }
            } catch (err: any) {
                setError(err.message || 'Falha ao carregar dados da organização.');
            } finally {
                setIsLoading(false);
            }
        } else {
            setError(adminData ? "Este administrador não está vinculado a uma organização." : "Dados do administrador não encontrados.");
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrg();
    }, [adminData]);

    const handleUpdateInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!organization) return;
        
        setError(''); // Clear previous errors

        if (ownerName.trim().split(/\s+/).length < 2) {
            setError("Por favor, insira seu nome completo (nome e sobrenome).");
            return;
        }

        const cleanedPhone = phone.replace(/\D/g, '');
        if (cleanedPhone.length < 10 || cleanedPhone.length > 11) {
            setError("O telefone deve ter 10 ou 11 dígitos (DDD + número).");
            return;
        }
    
        const cleanedTaxId = taxId.replace(/\D/g, '');
        if (cleanedTaxId.length !== 11 && cleanedTaxId.length !== 14) {
            setError("O CPF deve ter 11 dígitos e o CNPJ 14 dígitos.");
            return;
        }

        setIsSavingInfo(true);
        try {
            await updateOrganization(organization.id, { ownerName, ownerPhone: phone, ownerTaxId: taxId });
            // Refresh organization data to show the payment button
            await fetchOrg();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar informações.');
        } finally {
            setIsSavingInfo(false);
        }
    };
    
    const handlePayment = async () => {
        if (!organization) return;
        setIsProcessingPayment(true);
        setError('');
        try {
            const { payLink } = await createPagSeguroOrder(organization.id, organization.planId);
            window.location.href = payLink;
        } catch (err: any) {
            setError(err.message || 'Não foi possível iniciar o pagamento.');
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const formatDate = (timestamp?: Timestamp) => {
        if (!timestamp) return 'N/A';
        return timestamp.toDate().toLocaleDateString('pt-BR');
    };
    
    const planDetails = organization ? plans.find(p => p.id === organization.planId) : null;
    const isExpired = organization?.planExpiresAt && organization.planExpiresAt.toDate() < new Date();
    const needsRenewal = organization?.status === 'trial' || isExpired;
    const hasRequiredInfo = organization?.ownerName && organization?.ownerPhone && organization.ownerTaxId;

    const renderRenewalSection = () => {
        if (!needsRenewal || !organization) return null;

        if (!hasRequiredInfo) {
            return (
                <div className="mt-8 border-t border-gray-600 pt-6">
                    <h3 className="text-lg font-semibold text-white mb-2">Complete seus Dados para Pagar</h3>
                    <p className="text-gray-400 text-sm mb-4">O PagSeguro exige seu nome completo, telefone e CPF/CNPJ para processar a assinatura. Por favor, preencha abaixo.</p>
                    <form onSubmit={handleUpdateInfo} className="space-y-4">
                        <InputWithIcon Icon={UserIcon} type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Seu Nome Completo (Responsável)" required />
                        <InputWithIcon Icon={PhoneIcon} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone (com DDD)" required />
                        <InputWithIcon Icon={UserIcon} type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="CPF ou CNPJ" required />
                        <button type="submit" disabled={isSavingInfo} className="w-full sm:w-auto px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSavingInfo ? 'Salvando...' : 'Salvar e Continuar'}
                        </button>
                    </form>
                </div>
            );
        }

        return (
             <div className="mt-8 border-t border-gray-600 pt-6">
                <h3 className="text-lg font-semibold text-white mb-2">{isExpired ? 'Renovar Assinatura' : 'Ativar Assinatura'}</h3>
                <p className="text-gray-400 text-sm mb-4">{isExpired ? 'Sua assinatura expirou. Renove agora para continuar usando todos os recursos.' : 'Seu período de teste acabou. Realize o pagamento para ativar seu plano.'}</p>
                <button 
                    onClick={handlePayment} 
                    disabled={isProcessingPayment}
                    className="inline-flex items-center gap-3 px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                    <CreditCardIcon className="w-5 h-5" />
                    {isProcessingPayment ? 'Processando...' : `Pagar ${planDetails?.priceFormatted} com PagSeguro`}
                </button>
            </div>
        );
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center">Carregando...</div>;
        if (error && !organization) return <div className="text-center text-red-400">{error}</div>;
        if (!organization || !planDetails) return <div className="text-center text-gray-400">Não foi possível carregar os detalhes da sua assinatura.</div>;

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

                {renderRenewalSection()}
                
                {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
                
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