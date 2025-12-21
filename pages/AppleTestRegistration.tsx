
import React, { useState } from 'react';
import { registerForAppleTest } from '../services/testRegistrationService';
import { UserIcon, MailIcon, LogoIcon, ArrowLeftIcon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';

const AppleTestRegistration: React.FC = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await registerForAppleTest({
                ...formData,
                organizationId: 'sistema-global'
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4">
                <div className="bg-secondary p-8 rounded-2xl shadow-2xl border border-green-500/30 text-center max-w-md w-full">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Inscrição Realizada!</h2>
                    <p className="text-gray-400">Seu e-mail foi adicionado à fila de convites do TestFlight. Verifique sua caixa de entrada (e o spam) nas próximas horas para o convite oficial da Apple.</p>
                    <button onClick={() => navigate('/')} className="mt-6 text-primary hover:underline font-semibold">Voltar ao Início</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-2xl p-8 border border-gray-700">
                <div className="text-center mb-8">
                    <LogoIcon className="h-32 w-auto mx-auto mb-6" />
                    <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Inscrição Beta iOS</h1>
                    <p className="text-gray-400 text-sm mt-2">Cadastre o e-mail do seu ID Apple para baixar o App no iPhone.</p>
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
                                placeholder="E-mail do ID Apple (iCloud)"
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
                        {isLoading ? 'Processando...' : 'Solicitar Acesso Beta'}
                    </button>
                    
                    <p className="text-[10px] text-gray-500 text-center uppercase tracking-widest mt-4">
                        Equipe Certa Beta Program
                    </p>
                </form>
            </div>
            <button onClick={() => navigate(-1)} className="mt-6 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar
            </button>
        </div>
    );
};

export default AppleTestRegistration;
