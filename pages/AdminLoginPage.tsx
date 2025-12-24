
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../firebase/config';
import { MailIcon, LockClosedIcon, LogoIcon, ArrowLeftIcon } from '../components/Icons';

const AdminLoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await auth.signInWithEmailAndPassword(email, password);
            navigate('/admin');
        } catch (err: any) {
            console.error("Login error:", err);
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError("E-mail ou senha incorretos.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Muitas tentativas falhas. Tente novamente mais tarde.");
            } else {
                setError("Erro ao realizar login. Verifique sua conexão.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-2xl p-8 border border-gray-700">
                <div className="text-center mb-8">
                    <LogoIcon className="w-full max-w-[240px] h-auto mx-auto mb-6" />
                    <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Acesso Administrativo</h1>
                    <p className="text-gray-400 text-sm mt-2">Entre com suas credenciais para gerenciar sua equipe</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {error && (
                        <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-md text-sm text-center font-medium">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <MailIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Seu e-mail"
                                className="w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                required
                            />
                        </div>

                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Sua senha"
                                className="w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Entrando...
                            </>
                        ) : 'Acessar Painel'}
                    </button>
                </form>
            </div>
            
            <Link to="/" className="mt-6 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest">
                <ArrowLeftIcon className="w-4 h-4" />
                Voltar para a página inicial
            </Link>
        </div>
    );
};

export default AdminLoginPage;