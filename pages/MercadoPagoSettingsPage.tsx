import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMercadoPagoCredentials, setMercadoPagoCredentials } from '../services/credentialsService';
import { MercadoPagoCredentials } from '../types';
import { KeyIcon } from '../components/Icons';

const MercadoPagoSettingsPage: React.FC = () => {
    const [credentials, setCredentials] = useState<MercadoPagoCredentials>({
        publicKey: '',
        accessToken: ''
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
                const creds = await getMercadoPagoCredentials();
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
            await setMercadoPagoCredentials(credentials);
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
                <h1 className="text-3xl font-bold mt-1">Credenciais do Mercado Pago</h1>
            </div>
            <div className="max-w-2xl">
                <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                    <p className="text-sm text-gray-400">
                        Insira as chaves de API da sua conta do Mercado Pago para habilitar o processamento de assinaturas na plataforma.
                        Você pode encontrar suas credenciais no <a href="https://www.mercadopago.com.br/developers/panel/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">painel do desenvolvedor do Mercado Pago</a>.
                    </p>
                    {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm text-center">{error}</p>}
                    {success && <p className="text-green-300 bg-green-900/50 p-3 rounded-md text-sm text-center">{success}</p>}
                    <div>
                        <label htmlFor="publicKey" className="block text-sm font-medium text-gray-300">Public Key</label>
                        <input
                            type="text"
                            id="publicKey"
                            name="publicKey"
                            value={credentials.publicKey || ''}
                            onChange={handleChange}
                            placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                    </div>
                    <div>
                        <label htmlFor="accessToken" className="block text-sm font-medium text-gray-300">Access Token (Chave Privada)</label>
                        <input
                            type="password"
                            id="accessToken"
                            name="accessToken"
                            value={credentials.accessToken || ''}
                            onChange={handleChange}
                            placeholder="••••••••••••••••••••••••••••••••••••••••"
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                         <p className="text-xs text-gray-500 mt-1">Sua chave privada é armazenada de forma segura e nunca será exposta no frontend.</p>
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

export default MercadoPagoSettingsPage;
