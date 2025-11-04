import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import firebase from 'firebase/compat/app'; // For credential
import { auth } from '../firebase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, LockClosedIcon } from '../components/Icons';

// Reusable Input component
const InputWithIcon: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { Icon: React.ElementType }> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200" />
    </div>
);

const ChangePasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAdminAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!user || !user.email) {
            setError("Usuário não autenticado. Por favor, faça login novamente.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("As novas senhas não coincidem.");
            return;
        }
        if (newPassword.length < 6) {
            setError("A nova senha deve ter pelo menos 6 caracteres.");
            return;
        }

        setIsLoading(true);

        try {
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
            await user.reauthenticateWithCredential(credential);
            await user.updatePassword(newPassword);
            
            setSuccess("Senha alterada com sucesso! Você será redirecionado...");
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => navigate('/admin/settings'), 2500);

        } catch (err: any) {
            console.error("Password change failed:", err);
            if (err.code === 'auth/wrong-password') {
                setError("A senha atual está incorreta.");
            } else if (err.code === 'auth/weak-password') {
                setError("A nova senha é muito fraca.");
            } else {
                setError(err.message || "Ocorreu um erro ao alterar a senha.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-2xl font-bold text-center text-white mb-6">Alterar Senha</h1>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && <p className="text-red-400 text-sm p-3 bg-red-900/30 rounded-md">{error}</p>}
                    {success && <p className="text-green-400 text-sm p-3 bg-green-900/30 rounded-md">{success}</p>}
                    
                    <InputWithIcon 
                        Icon={LockClosedIcon} 
                        type="password" 
                        value={currentPassword} 
                        onChange={(e) => setCurrentPassword(e.target.value)} 
                        placeholder="Senha Atual" 
                        required 
                    />
                    <InputWithIcon 
                        Icon={LockClosedIcon} 
                        type="password" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        placeholder="Nova Senha" 
                        required 
                    />
                    <InputWithIcon 
                        Icon={LockClosedIcon} 
                        type="password" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        placeholder="Confirmar Nova Senha" 
                        required 
                    />
                    
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
                    >
                        {isLoading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordPage;