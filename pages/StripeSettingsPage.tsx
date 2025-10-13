import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStripeCredentials, setStripeCredentials } from '../services/credentialsService';
import { StripeCredentials } from '../types';

const StripeSettingsPage: React.FC = () => {
    const [credentials, setCredentials] = useState<StripeCredentials>({
        publicKey: '',
        secretKey: ''
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const fetchCredentials = async () => {
            setIsLoading(true);
            setError('');
            try {
                const creds = await getStripeCredentials();
                setCredentials(creds);
            } catch (err: any) {
                setError(err.message || 'Falha ao carregar as credenciais.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchCredentials();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError('');
        setSuccess('');
        try {
            await setStripeCredentials(credentials);
            setSuccess('Credenciais salvas com sucesso!');
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar as credenciais.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="text-center py-10">Carregando credenciais...</div>;
    }

    return (
        <div>
            <div className="mb-6">
                <Link to="/admin" className="text-sm text-primary hover:underline">&larr; Voltar ao Dashboard</Link>
                <h1 className="text-3xl font-bold mt-1">Credenciais do Stripe</h1>
            </div>
            <div className="max-w-2xl">
                <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                    <p className="text-sm text-gray-400">
                        Insira as chaves de API da sua conta do Stripe para habilitar o processamento de assinaturas.
                        Você pode encontrar suas credenciais no <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">painel do desenvolvedor do Stripe</a>.
                    </p>
                    {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm text-center">{error}</p>}
                    {success && <p className="text-green-300 bg-green-900/50 p-3 rounded-md text-sm text-center">{success}</p>}
                    <div>
                        <label htmlFor="publicKey" className="block text-sm font-medium text-gray-300">Publishable Key (Chave Publicável)</label>
                        <input
                            type="text"
                            id="publicKey"
                            name="publicKey"
                            value={credentials.publicKey || ''}
                            onChange={handleChange}
                            placeholder="pk_test_..."
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                        <p className="text-xs text-gray-500 mt-1">Esta chave é usada no frontend para redirecionar o cliente para o checkout do Stripe de forma segura.</p>
                    </div>
                    <div>
                        <label htmlFor="secretKey" className="block text-sm font-medium text-gray-300">Secret Key (Chave Secreta)</label>
                        <input
                            type="password"
                            id="secretKey"
                            name="secretKey"
                            value={credentials.secretKey || ''}
                            onChange={handleChange}
                            placeholder="••••••••••••••••••••••••••••••••••••••••"
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                        <div className="text-sm text-yellow-400 bg-yellow-900/50 p-3 rounded-md mt-2 space-y-1">
                            <p className="font-bold">Ação Manual Necessária:</p>
                            <p className="text-yellow-300">Esta chave secreta também <strong>precisa ser configurada no ambiente do backend (Firebase Functions)</strong> para que os pagamentos funcionem. Salvar aqui apenas armazena a chave para referência.</p>
                            <p className="text-yellow-300">Peça ao seu desenvolvedor para executar o seguinte comando no terminal do projeto e depois reimplantar as funções:</p>
                            <code className="block bg-black/50 p-2 rounded-md mt-1 text-white text-xs break-all">firebase functions:config:set stripe.secret_key="SUA_CHAVE_SECRETA_AQUI"</code>
                        </div>
                    </div>
                     <div className="flex justify-end pt-4">
                        <button type="submit" disabled={isSaving} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSaving ? 'Salvando...' : 'Salvar Credenciais'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StripeSettingsPage;