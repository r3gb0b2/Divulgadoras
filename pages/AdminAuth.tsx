import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUserProfile } from '../services/userService';
import AdminPanel from './AdminPanel';
import { AdminUser } from '../types';
import { MailIcon } from '../components/Icons';

const AdminAuth: React.FC = () => {
    const [userProfile, setUserProfile] = useState<AdminUser | null>(() => {
        try {
            const storedUser = sessionStorage.getItem('adminUserProfile');
            if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                // Structural validation to prevent crashes from malformed session data
                if (parsedUser && typeof parsedUser === 'object' && 'uid' in parsedUser && 'role' in parsedUser && 'states' in parsedUser) {
                    return parsedUser as AdminUser;
                }
            }
            // If data is invalid or doesn't exist, ensure it's cleared.
            sessionStorage.removeItem('adminUserProfile');
            return null;
        } catch (error) {
            console.error("Failed to parse user profile from session storage", error);
            sessionStorage.removeItem('adminUserProfile');
            return null;
        }
    });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const profile = await getUserProfile(userCredential.user.uid);
            
            if (profile) {
                sessionStorage.setItem('adminUserProfile', JSON.stringify(profile));
                setUserProfile(profile);
            } else {
                // User is authenticated with Firebase Auth but doesn't have a profile in our 'users' collection.
                await auth.signOut(); // Log them out.
                setError('Você não tem permissão para acessar esta área.');
            }

        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-email') {
                setError('E-mail ou senha inválidos.');
            } else {
                setError('Ocorreu um erro ao tentar fazer login.');
            }
        } finally {
            setIsLoading(false);
            setPassword('');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('adminUserProfile');
        setUserProfile(null);
        auth.signOut();
    };

    if (userProfile) {
        return <AdminPanel userProfile={userProfile} onLogout={handleLogout} />;
    }

    return (
        <div className="flex items-center justify-center flex-grow">
            <div className="w-full max-w-md">
                <form onSubmit={handleLogin} className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-light mb-4">Acesso Restrito</h1>
                    <p className="text-gray-400 mb-6">Por favor, insira suas credenciais para acessar o painel administrativo.</p>
                    
                    <div className="space-y-4">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <MailIcon className="h-5 w-5 text-gray-400" />
                            </span>
                             <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="E-mail"
                                className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                                required
                                autoFocus
                            />
                        </div>
                       <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Senha"
                            className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                            required
                        />
                    </div>
                    
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                    
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-6 flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminAuth;