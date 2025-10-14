import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { plans, Plan } from './PricingPage';
import { signUpAndCreateOrganization } from '../services/adminService';
import { MailIcon, LockClosedIcon, BuildingOfficeIcon } from '../components/Icons';

const AdminRegistrationPage: React.FC = () => {
    const { planId } = useParams<{ planId: string }>();
    const navigate = useNavigate();
    const selectedPlan: Plan | undefined = plans.find(p => p.id === planId);

    const [formData, setFormData] = useState({
        orgName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }

        if (!selectedPlan) {
            setError("Plano inválido selecionado.");
            return;
        }

        setIsLoading(true);
        try {
            await signUpAndCreateOrganization(
                formData.email,
                formData.password,
                formData.orgName,
                selectedPlan.id as 'basic' | 'professional'
            );
            // On success, Firebase onAuthStateChanged will redirect to /admin
            navigate('/admin');
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro desconhecido.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!selectedPlan) {
        return (
            <div className="text-center py-10">
                <h2 className="text-2xl text-red-400">Plano não encontrado.</h2>
                <Link to="/planos" className="mt-4 inline-block text-primary hover:underline">
                    Voltar para a página de planos
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Criar sua Conta</h1>
                <p className="text-center text-primary font-semibold text-lg mb-6">Plano {selectedPlan.name}</p>

                {error && (
                    <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 mb-6 rounded-md" role="alert">
                        <p className="font-bold">Erro no Cadastro</p>
                        <p>{error}</p>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="text-sm font-medium text-gray-300">Nome da Produtora / Organização</label>
                         <div className="relative mt-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                            </span>
                             <input type="text" name="orgName" value={formData.orgName} onChange={handleChange} required className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md bg-gray-700"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300">Seu E-mail (será seu login)</label>
                         <div className="relative mt-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <MailIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md bg-gray-700" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300">Senha</label>
                         <div className="relative mt-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input type="password" name="password" value={formData.password} onChange={handleChange} required className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md bg-gray-700" placeholder="Mínimo 6 caracteres"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300">Confirmar Senha</label>
                        <div className="relative mt-1">
                             <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md bg-gray-700"/>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        Ao se cadastrar, você inicia um teste gratuito de 3 dias. Você concorda com nossos Termos de Serviço e Política de Privacidade.
                    </p>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
                    >
                        {isLoading ? 'Criando conta...' : `Iniciar Teste Gratuito - ${selectedPlan.priceFormatted}/mês`}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminRegistrationPage;
