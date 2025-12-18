
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { registerForAppleTest } from '../services/testRegistrationService';
import { getPublicOrganizations } from '../services/organizationService';
import { UserIcon, MailIcon, LogoIcon } from '../components/Icons';

const AppleTestRegistration: React.FC = () => {
    const { organizationId: urlOrgId } = useParams<{ organizationId: string }>();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingOrg, setIsFetchingOrg] = useState(!urlOrgId);
    const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(urlOrgId || null);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const resolveOrg = async () => {
            if (urlOrgId) return;

            try {
                // Busca as organizações públicas para associar o teste a uma delas
                const orgs = await getPublicOrganizations();
                if (orgs.length > 0) {
                    // Associa à primeira organização ativa encontrada por padrão
                    setResolvedOrgId(orgs[0].id);
                } else {
                    setError("Nenhuma organização ativa encontrada para processar inscrições.");
                }
            } catch (err) {
                setError("Erro ao identificar a produtora responsável.");
            } finally {
                setIsFetchingOrg(false);
            }
        };

        resolveOrg();
    }, [urlOrgId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        if (!resolvedOrgId) {
            setError("Organização não identificada. Por favor, utilize o link oficial.");
            setIsLoading(false);
            return;
        }

        try {
            await registerForAppleTest({
                ...formData,
                organizationId: resolvedOrgId
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isFetchingOrg) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center p-4">
                <div className="bg-secondary p-8 rounded-2xl shadow-2xl border border-green-500/30 text-center max-w-md w-full">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Inscrição Realizada!</h2>
                    <p className="text-gray-400">Em breve você receberá um e-mail da Apple (TestFlight) com as instruções para baixar o nosso aplicativo oficial no seu iPhone.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-2xl p-8 border border-gray-700">
                <div className="text-center mb-8">
                    <LogoIcon className="h-12 w-auto mx-auto text-primary mb-4" />
                    <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Beta Tester iOS</h1>
                    <p className="text-gray-400 text-sm mt-2">Participe do grupo de testes exclusivo do nosso app no iPhone.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && <div className="bg-red-900/30 text-red-300 p-3 rounded-md text-xs border border-red-800">{error}</div>}
                    
                    <div className="space-y-4">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <UserIcon className="h-5 w-5 text-gray-500" />
                            </span>
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                placeholder="Primeiro Nome"
                                className="w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:ring-2 focus:ring-primary outline-none"
                                required
                            />
                        </div>

                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <UserIcon className="h-5 w-5 text-gray-500" />
                            </span>
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                placeholder="Sobrenome"
                                className="w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:ring-2 focus:ring-primary outline-none"
                                required
                            />
                        </div>

                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <MailIcon className="h-5 w-5 text-gray-500" />
                            </span>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="E-mail (o mesmo do seu ID Apple)"
                                className="w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:ring-2 focus:ring-primary outline-none"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-all shadow-lg disabled:opacity-50"
                    >
                        {isLoading ? 'Enviando...' : 'Quero Testar o App'}
                    </button>
                    
                    <p className="text-[10px] text-gray-500 text-center uppercase tracking-widest mt-4">
                        Powered by Equipe Certa
                    </p>
                </form>
            </div>
        </div>
    );
};

export default AppleTestRegistration;
