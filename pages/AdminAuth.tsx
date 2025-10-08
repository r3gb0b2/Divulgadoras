import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { signInWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';
import AdminPanel from './AdminPanel';

const AdminAuth: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError('E-mail ou senha inválidos. Verifique suas credenciais.');
            console.error(err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (user) {
        return <AdminPanel />;
    }

    return (
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-200px)]">
            <div className="w-full max-w-md mx-auto">
                <form onSubmit={handleLogin} className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg px-6 py-8 sm:p-8 text-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Acesso Restrito</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">Por favor, insira suas credenciais para acessar o painel administrativo.</p>
                    
                    <div className="space-y-4">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="E-mail"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                            required
                            autoFocus
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Senha"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                            required
                        />
                    </div>
                    
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                    
                    <button
                        type="submit"
                        className="w-full mt-6 flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminAuth;