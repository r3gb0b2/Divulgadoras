
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../firebase/config';
import { sendAdminPasswordResetEmail, submitAdminApplication } from '../services/adminService';
import { MailIcon, LockClosedIcon, LogoIcon, ArrowLeftIcon, CheckCircleIcon, RefreshIcon, UserIcon, PhoneIcon } from '../components/Icons';

const AdminLoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const resetStates = () => {
        setError(null);
        setSuccessMessage(null);
    };

    const validateEmail = (email: string) => {
        const trimmed = email.trim().toLowerCase();
        if (trimmed.endsWith('.con') || trimmed.endsWith('.co')) {
            return "O e-mail parece estar errado (termina em .con ou .co).";
        }
        return null;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const emailErr = validateEmail(email);
        if (emailErr) { setError(emailErr); return; }

        setIsLoading(true);
        resetStates();
        try {
            await auth.signInWithEmailAndPassword(email.toLowerCase().trim(), password);
            navigate('/admin');
        } catch (err: any) {
            setError("E-mail ou senha incorretos.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        const emailErr = validateEmail(email);
        if (emailErr) { setError(emailErr); return; }

        setIsLoading(true);
        resetStates();
        try {
            await submitAdminApplication({ name, email: email.toLowerCase().trim(), phone }, "EquipeCerta@2024");
            setSuccessMessage("Solicitação enviada com sucesso!");
            setIsRequesting(false);
        } catch (err: any) {
            setError(err.message || "Erro ao enviar solicitação.");
        } finally {
            setIsLoading(false);
        }
    };

    // Restante do componente permanece igual...
    const getTitle = () => isResetting ? 'Recuperar Acesso' : isRequesting ? 'Solicitar Acesso' : 'Acesso Admin';
    const getSubTitle = () => isResetting ? 'Link via e-mail' : isRequesting ? 'Preencha os dados' : 'Gerenciamento';

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-[2.5rem] p-8 border border-gray-700 animate-fadeIn">
                <div className="text-center mb-8">
                    <LogoIcon className="w-full max-w-[200px] h-auto mx-auto mb-6" />
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter">{getTitle()}</h1>
                </div>

                <form onSubmit={isResetting ? undefined : isRequesting ? handleRequestAccess : handleLogin} className="space-y-6">
                    {error && <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 rounded-2xl text-xs text-center font-bold">{error}</div>}
                    {successMessage && <div className="bg-green-900/30 border border-green-800 text-green-300 p-4 rounded-2xl text-xs text-center font-bold">{successMessage}</div>}

                    <div className="space-y-4">
                        {isRequesting && (
                            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" required />
                        )}
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail profissional" className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" required />
                        {isRequesting && (
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp" className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" required />
                        )}
                        {!isResetting && !isRequesting && (
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary" required />
                        )}
                    </div>

                    <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl disabled:opacity-50">
                        {isLoading ? <RefreshIcon className="animate-spin h-5 w-5 mx-auto" /> : isRequesting ? 'ENVIAR SOLICITAÇÃO' : 'ACESSAR PAINEL'}
                    </button>

                    <div className="text-center">
                        <button type="button" onClick={() => { setIsRequesting(!isRequesting); resetStates(); }} className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
                            {isRequesting ? 'Voltar para o Login' : 'Solicitar Acesso'}
                        </button>
                    </div>
                </form>
            </div>
            <Link to="/" className="mt-8 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"><ArrowLeftIcon className="w-4 h-4" /> Página Inicial</Link>
        </div>
    );
};

export default AdminLoginPage;
