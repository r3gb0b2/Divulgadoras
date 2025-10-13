import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUpAndCreateOrganization } from '../services/adminService';
import { MailIcon, LockClosedIcon } from '../components/Icons';

const AdminRegistrationPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [orgName, setOrgName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }
        setError('');
        setIsLoading(true);
        try {
            // FIX: Added 'basic' as the planId argument to satisfy the function signature.
            await signUpAndCreateOrganization(email, password, orgName, 'basic');
            alert('Sua organização foi criada com sucesso! Você será redirecionado para a tela de login.');
            navigate('/admin');
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao criar sua organização.');
        } finally {
            setIsLoading(false);
        }
    };

    const inputWrapperStyle = "relative";
    const iconStyle = "absolute inset-y-0 left-0 flex items-center pl-3";
    const inputStyle = "w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200";

    return (
        <div className="flex items-center justify-center flex-grow">
            <div className="w-full max-w-md">
                <form onSubmit={handleSubmit} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Crie sua Organização</h1>
                    <p className="text-gray-400 mb-6">Cadastre-se para começar a gerenciar seus próprios eventos e divulgadoras na plataforma.</p>
                    
                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

                    <div className="space-y-4">
                        <input
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder="Nome da sua Empresa ou Evento"
                            className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                            required
                            autoFocus
                        />
                        <div className={inputWrapperStyle}>
                            <span className={iconStyle}>
                                <MailIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Seu melhor e-mail (para login)"
                                className={inputStyle}
                                required
                            />
                        </div>
                        <div className={inputWrapperStyle}>
                            <span className={iconStyle}>
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Defina uma senha (mínimo 6 caracteres)"
                                className={inputStyle}
                                required
                            />
                        </div>
                        <div className={inputWrapperStyle}>
                            <span className={iconStyle}>
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                            </span>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirmar senha"
                                className={inputStyle}
                                required
                            />
                        </div>
                    </div>
                    
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-6 flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Criando...' : 'Criar minha Conta'}
                    </button>
                    
                    <p className="text-sm text-gray-400 mt-4">
                        Já tem uma conta?{' '}
                        <Link to="/admin" className="font-medium text-primary hover:text-primary-dark">
                            Faça login aqui
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default AdminRegistrationPage;