import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { plans, Plan } from './PricingPage';
import { functions, auth } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { BuildingOfficeIcon, MailIcon, LockClosedIcon } from '../components/Icons';

const SubscriptionFlowPage: React.FC = () => {
    const { planId } = useParams<{ planId: string }>();
    const navigate = useNavigate();
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

    // Form State
    const [orgName, setOrgName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (!planId) {
            navigate('/planos');
            return;
        }
        const plan = plans.find(p => p.id === planId);
        if (!plan) {
            navigate('/planos');
            return;
        }
        setSelectedPlan(plan);
    }, [planId, navigate]);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }
        
        setIsProcessing(true);

        try {
            if (!selectedPlan) throw new Error("Plano não selecionado.");
            
            const createTrialOrg = httpsCallable(functions, 'createTrialOrganization');
            
            const result: any = await createTrialOrg({
                planId: selectedPlan.id,
                orgName,
                email,
                password,
            });
            
            if (result.data.success && result.data.organizationId) {
                // Log in the new user automatically
                await signInWithEmailAndPassword(auth, email, password);
                // Redirect to their new admin panel
                navigate(`/admin`);
            } else {
                throw new Error("Não foi possível criar a organização.");
            }

        } catch (err: any) {
            console.error("Error creating trial organization:", err);
            setError(err.message || 'Ocorreu um erro. Verifique os dados e tente novamente.');
            setIsProcessing(false);
        }
    };
    
    if (!selectedPlan) {
        return (
            <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8 relative">
                {isProcessing && (
                    <div className="absolute inset-0 bg-secondary bg-opacity-95 flex flex-col justify-center items-center rounded-lg z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        <p className="mt-4 text-gray-300 font-semibold">Criando sua conta, aguarde...</p>
                    </div>
                )}
                
                <div className="text-center mb-8">
                     <h1 className="text-3xl font-bold text-white mb-2">Crie sua Conta</h1>
                     <p className="text-gray-400">Você está iniciando um teste gratuito do <span className="font-bold text-primary">{selectedPlan.name}</span>.</p>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-6">
                    {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm text-center">{error}</p>}
                    
                    <InputWithIcon Icon={BuildingOfficeIcon} type="text" placeholder="Nome da Empresa / Evento" value={orgName} onChange={e => setOrgName(e.target.value)} required />
                    <InputWithIcon Icon={MailIcon} type="email" placeholder="Seu E-mail de Acesso" value={email} onChange={e => setEmail(e.target.value)} required />
                    <InputWithIcon Icon={LockClosedIcon} type="password" placeholder="Crie uma Senha (mín. 6 caracteres)" value={password} onChange={e => setPassword(e.target.value)} required />
                    <InputWithIcon Icon={LockClosedIcon} type="password" placeholder="Confirme a Senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                    
                    <div className="pt-4">
                        <button type="submit" disabled={isProcessing} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-300">
                           {isProcessing ? 'Processando...' : `Iniciar Teste Gratuito`}
                        </button>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        Ao continuar, você concorda com nossos Termos de Serviço e inicia seu período de teste de 3 dias.
                    </p>
                </form>
            </div>
        </div>
    );
};


interface InputWithIconProps extends React.InputHTMLAttributes<HTMLInputElement> {
    Icon: React.ElementType;
}

const InputWithIcon: React.FC<InputWithIconProps> = ({ Icon, ...props }) => {
    return (
        <div>
            <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icon className="h-5 w-5 text-gray-400" />
                </span>
                <input
                    {...props}
                    className="w-full pl-10 pr-3 py-3 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                />
            </div>
        </div>
    );
};

export default SubscriptionFlowPage;