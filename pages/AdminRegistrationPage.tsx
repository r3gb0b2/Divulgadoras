import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestAdminAccess } from '../services/adminService';
import { MailIcon } from '../components/Icons';

const AdminRegistrationPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            await requestAdminAccess(email);
            setSuccess('Sua solicitação foi enviada com sucesso! Um administrador irá analisá-la em breve.');
            setEmail('');
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao enviar sua solicitação.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center flex-grow">
            <div className="w-full max-w-md">
                <form onSubmit={handleSubmit} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Solicitar Acesso de Admin</h1>
                    <p className="text-gray-400 mb-6">Insira seu e-mail para solicitar acesso ao painel. Sua conta será criada após a aprovação de um superadmin.</p>
                    
                    {success && (
                        <div className="bg-green-900/50 border-l-4 border-green-500 text-green-300 p-4 mb-6 rounded-md text-left" role="alert">
                            <p className="font-bold">Solicitação Enviada!</p>
                            <p>{success}</p>
                        </div>
                    )}
                    
                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

                    {!success && (
                        <>
                            <div className="relative mb-4">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <MailIcon className="h-5 w-5 text-gray-400" />
                                </span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Seu melhor e-mail"
                                    className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                                    required
                                    autoFocus
                                />
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'Enviando...' : 'Solicitar Acesso'}
                            </button>
                        </>
                    )}
                    
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
