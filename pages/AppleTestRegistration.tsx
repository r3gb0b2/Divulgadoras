
import React, { useState } from 'react';
import { registerForAppleTest, checkAppleEmailExists } from '../services/testRegistrationService';
import { UserIcon, MailIcon, LogoIcon, ArrowLeftIcon, AlertTriangleIcon, CheckCircleIcon, SparklesIcon } from '../components/Icons';
import { useNavigate, Link } from 'react-router-dom';

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
                <div className="bg-secondary p-8 rounded-3xl shadow-2xl border border-green-500/30 text-center max-w-md w-full">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircleIcon className="w-10 h-10 text-green-500" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Inscrição Realizada!</h2>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Seu e-mail foi adicionado à fila. Agora, aguarde o convite oficial da <strong>Apple (TestFlight)</strong> que chegará na sua caixa de entrada.
                    </p>
                    <div className="mt-6 p-4 bg-gray-800 rounded-2xl text-xs text-left text-gray-400 border border-gray-700">
                        <strong>Próximo passo:</strong> Quando o e-mail da Apple chegar, você precisará baixar o app <strong>TestFlight</strong> na App Store para então instalar o nosso aplicativo.
                    </div>
                    <Link to="/apple-test/tutorial" className="mt-6 inline-block w-full py-4 bg-gray-700 text-white font-bold rounded-2xl hover:bg-gray-600 transition-all text-sm uppercase tracking-widest">
                        Ver tutorial de instalação
                    </Link>
                    <button onClick={() => navigate('/')} className="mt-4 w-full py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-dark transition-all text-sm uppercase tracking-widest">Voltar ao Início</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-[2.5rem] p-8 md:p-10 border border-gray-700">
                <div className="text-center mb-8">
                    <LogoIcon className="w-full max-w-[200px] h-auto mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Beta Tester <span className="text-primary">iOS</span></h1>
                    <p className="text-gray-400 text-xs mt-2 font-bold uppercase tracking-widest">Exclusivo para iPhone</p>
                </div>

                {/* LINK PARA TUTORIAL */}
                <Link 
                    to="/apple-test/tutorial" 
                    className="mb-8 block p-4 bg-primary/10 border border-primary/20 rounded-2xl group hover:bg-primary/20 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="w-6 h-6 text-primary animate-pulse" />
                        <div className="text-left">
                            <p className="text-white text-[11px] font-black uppercase tracking-tight">Já recebeu o convite?</p>
                            <p className="text-primary text-[10px] font-bold uppercase tracking-widest mt-0.5 group-hover:underline">Veja como instalar &rarr;</p>
                        </div>
                    </div>
                </Link>

                {/* ALERTA CRÍTICO SOBRE ICLOUD */}
                <div className="mb-8 p-4 bg-blue-900/30 border border-blue-500/50 rounded-2xl flex gap-3 items-start">
                    <AlertTriangleIcon className="w-10 h-10 text-blue-400 flex-shrink-0" />
                    <div className="text-left">
                        <p className="text-blue-200 text-[11px] font-black uppercase tracking-tight">Atenção Obrigatória</p>
                        <p className="text-blue-100 text-[10px] leading-tight mt-1">
                            Você <strong>DEVE</strong> usar o e-mail que está logado no seu iPhone (Ajustes &gt; Seu Nome).
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && <div className="bg-red-900/30 text-red-300 p-4 rounded-2xl text-xs font-bold border border-red-800 text-center">{error}</div>}
                    
                    <div className="space-y-4">
                        <div className="relative group">
                            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                placeholder="Primeiro Nome"
                                className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none font-medium placeholder-gray-600"
                                required
                            />
                        </div>

                        <div className="relative group">
                            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                placeholder="Sobrenome"
                                className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none font-medium placeholder-gray-600"
                                required
                            />
                        </div>

                        <div className="relative group">
                            <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="E-mail do seu ID Apple / iCloud"
                                className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none font-black placeholder-gray-600"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-5 bg-primary text-white font-black text-lg rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95"
                    >
                        {isLoading ? 'ENVIANDO...' : 'SOLICITAR ACESSO BETA'}
                    </button>
                    
                    <p className="text-[9px] text-gray-500 text-center uppercase font-black tracking-[0.2em] mt-4">
                        Sistema de Gestão Oficial • TestFlight Ready
                    </p>
                </form>
            </div>
            <button onClick={() => navigate(-1)} className="mt-8 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar
            </button>
        </div>
    );
};

export default AppleTestRegistration;
