
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../firebase/config';
import { sendAdminPasswordResetEmail } from '../services/adminService';
// FIX: Added missing RefreshIcon import to resolve the error on line 139.
import { MailIcon, LockClosedIcon, LogoIcon, ArrowLeftIcon, CheckCircleIcon, RefreshIcon } from '../components/Icons';

const AdminLoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await auth.signInWithEmailAndPassword(email, password);
            navigate('/admin');
        } catch (err: any) {
            console.error("Login error:", err);
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
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

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError("Por favor, informe seu e-mail para receber o link.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await sendAdminPasswordResetEmail(email);
            setSuccessMessage("Link enviado! Verifique sua caixa de entrada.");
            setIsResetting(false);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-[2.5rem] p-8 md:p-10 border border-gray-700 animate-fadeIn">
                <div className="text-center mb-8">
                    <LogoIcon className="w-full max-w-[200px] h-auto mx-auto mb-6" />
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
                        {isResetting ? 'Recuperar Acesso' : 'Acesso Admin'}
                    </h1>
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-2">
                        {isResetting ? 'Enviaremos um link para seu e-mail' : 'Gerenciamento de Equipes'}
                    </p>
                </div>

                <form onSubmit={isResetting ? handleForgotPassword : handleLogin} className="space-y-6">
                    {error && (
                        <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 rounded-2xl text-xs text-center font-bold animate-shake">
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="bg-green-900/30 border border-green-800 text-green-300 p-4 rounded-2xl text-xs text-center font-bold flex items-center justify-center gap-2">
                            <CheckCircleIcon className="w-4 h-4" />
                            {successMessage}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="relative group">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-4">
                                <MailIcon className="h-5 w-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                            </span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="E-mail cadastrado"
                                className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-bold placeholder-gray-600"
                                required
                            />
                        </div>

                        {!isResetting && (
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-4">
                                    <LockClosedIcon className="h-5 w-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                                </span>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Sua senha secreta"
                                    className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder-gray-600"
                                    required
                                />
                            </div>
                        )}
                    </div>

                    {!isResetting && (
                        <div className="text-right px-2">
                            <button 
                                type="button"
                                onClick={() => { setIsResetting(true); setError(null); setSuccessMessage(null); }}
                                className="text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-primary transition-colors"
                            >
                                Esqueci minha senha
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-5 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95"
                    >
                        {isLoading ? (
                            <RefreshIcon className="animate-spin h-5 w-5" />
                        ) : isResetting ? 'ENVIAR LINK DE RECUPERAÇÃO' : 'ACESSAR PAINEL'}
                    </button>

                    {isResetting && (
                        <div className="text-center">
                            <button 
                                type="button"
                                onClick={() => { setIsResetting(false); setError(null); }}
                                className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                            >
                                Voltar para o Login
                            </button>
                        </div>
                    )}
                </form>
            </div>
            
            <Link to="/" className="mt-8 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-black uppercase tracking-[0.2em]">
                <ArrowLeftIcon className="w-4 h-4" />
                Página Inicial
            </Link>
        </div>
    );
};

export default AdminLoginPage;
