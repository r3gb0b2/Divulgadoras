
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { plans, Plan } from './PricingPage'; // Assuming plans are exported from PricingPage
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
// FIX: Import signInWithEmailAndPassword from firebase/auth for Firebase v9 modular SDK.
import { signInWithEmailAndPassword } from 'firebase/auth';
import { MailIcon, LockClosedIcon, BuildingOfficeIcon, UserIcon } from '../components/Icons';

const SubscriptionFlowPage: React.FC = () => {
    const { planId } = useParams<{ planId: string }>();
    const navigate = useNavigate();
    const plan = plans.find(p => p.id === planId);

    const [formData, setFormData] = useState({
        orgName: '',
        ownerName: '',
        email: '',
        password: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!plan) {
            setError("Plano inválido selecionado.");
            setIsLoading(false);
            return;
        }

        if (formData.ownerName.trim().split(/\s+/).length < 2) {
            setError("Por favor, insira seu nome completo (nome e sobrenome).");
            setIsLoading(false);
            return;
        }

        try {
            const createOrganizationAndUser = httpsCallable(functions, 'createOrganizationAndUser');
            const result = await createOrganizationAndUser({
                ...formData,
                planId: plan.id
            });
            const data = result.data as { success: boolean, message?: string, orgId?: string };

            if (data.success) {
                // Automatically log the user in, then redirect to their new panel
                // FIX: Called signInWithEmailAndPassword as a function, passing the auth instance as an argument, which is the correct syntax for Firebase v9+.
                await signInWithEmailAndPassword(auth, formData.email, formData.password);
                navigate('/admin');
            } else {
                throw new Error(data.message || 'Ocorreu um erro desconhecido.');
            }
        } catch (err: any) {
            console.error("Subscription flow failed:", err);
            const detail = err.details?.message || err.message;
            setError(`Falha ao criar organização: ${detail}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!plan) {
        return <div className="text-center text-red-400">Plano não encontrado.</div>;
    }

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-2xl font-bold text-center text-white mb-2">Finalizar Inscrição</h1>
                <p className="text-center text-gray-400 mb-6">
                    Você está se inscrevendo no plano <span className="font-bold text-primary">{plan.name}</span>.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-200">1. Detalhes da sua Organização</h2>
                        <div className="mt-2 space-y-4">
                            <InputWithIcon Icon={BuildingOfficeIcon} type="text" name="orgName" placeholder="Nome da sua produtora/agência" value={formData.orgName} onChange={handleChange} required />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold text-gray-200">2. Crie sua conta de Admin</h2>
                        <div className="mt-2 space-y-4">
                            <InputWithIcon Icon={UserIcon} type="text" name="ownerName" placeholder="Seu nome completo (responsável)" value={formData.ownerName} onChange={handleChange} required />
                            <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail (será seu login)" value={formData.email} onChange={handleChange} required />
                            <InputWithIcon Icon={LockClosedIcon} type="password" name="password" placeholder="Crie uma senha de acesso (mín. 6 chars)" value={formData.password} onChange={handleChange} required />
                        </div>
                    </div>
                    
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Criando sua conta...' : `Iniciar Teste Gratuito de 3 Dias`}
                    </button>
                    <p className="text-xs text-gray-500 text-center">Ao continuar, você concorda com nossos Termos de Serviço. O teste gratuito de 3 dias será iniciado.</p>
                </form>
            </div>
        </div>
    );
};

interface InputWithIconProps extends React.InputHTMLAttributes<HTMLInputElement> {
    Icon: React.ElementType;
}
const InputWithIcon: React.FC<InputWithIconProps> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200" />
    </div>
);


export default SubscriptionFlowPage;