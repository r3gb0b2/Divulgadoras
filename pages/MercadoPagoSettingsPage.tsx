import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMercadoPagoCredentials, setMercadoPagoCredentials } from '../services/credentialsService';
import { MercadoPagoCredentials } from '../types';
import { KeyIcon, LockClosedIcon } from '../components/Icons';

const MercadoPagoSettingsPage: React.FC = () => {
    const [credentials, setCredentials] = useState<MercadoPagoCredentials>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [showToken, setShowToken] = useState(false);

    useEffect(() => {
        const fetchCreds = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const creds = await getMercadoPagoCredentials();
                setCredentials(creds);
            } catch (err) {
                setError("Falha ao carregar as credenciais.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchCreds();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await setMercadoPagoCredentials(credentials);
            setSuccessMessage("Credenciais salvas com sucesso!");
        } catch (err) {
            setError("Falha ao salvar as credenciais.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            <div className="mb-6">
                <Link to="/admin" className="text-sm text-primary hover:underline">&larr; Voltar ao Dashboard</Link>
                <h1 className="text-3xl font-bold mt-1 flex items-center"><KeyIcon className="w-8 h-8 mr-3 text-primary"/>Credenciais do Mercado Pago</h1>
            </div>
            
            <div className="max-w-3xl">
                <div className="bg-secondary shadow-lg rounded-lg p-6">
                    <p className="text-gray-400 mb-6">
                        Insira aqui as chaves de API da sua conta do Mercado Pago. Estas credenciais são necessárias para processar os pagamentos das assinaturas.
                    </p>
                    <div className="bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-300 p-4 mb-6 rounded-md">
                        <p className="font-bold">Atenção!</p>
                        <p>Mantenha seu Access Token seguro. Nunca o compartilhe publicamente.</p>
                    </div>

                    {isLoading ? (
                        <p>Carregando credenciais...</p>
                    ) : (
                        <form onSubmit={handleSave} className="space-y-6">
                            <div>
                                <label htmlFor="publicKey" className="block text-sm font-medium text-gray-300">Public Key</label>
                                <input
                                    id="publicKey"
                                    name="publicKey"
                                    type="text"
                                    value={credentials.publicKey || ''}
                                    onChange={handleChange}
                                    placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                    className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                                />
                                <p className="text-xs text-gray-500 mt-1">Sua chave pública, usada no frontend para iniciar o checkout.</p>
                            </div>

                            <div>
                                <label htmlFor="accessToken" className="block text-sm font-medium text-gray-300">Access Token</label>
                                <div className="relative mt-1">
                                    <input
                                        id="accessToken"
                                        name="accessToken"
                                        type={showToken ? 'text' : 'password'}
                                        value={credentials.accessToken || ''}
                                        onChange={handleChange}
                                        placeholder="APP_USR-xxxxxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxx-xxxxxxxxxx"
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-200"
                                        aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                                    >
                                        <LockClosedIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Sua chave privada, usada no backend para criar e gerenciar pagamentos.</p>
                            </div>
                            
                            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                            {successMessage && <p className="text-green-400 text-sm text-center">{successMessage}</p>}

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                            >
                                {isSaving ? 'Salvando...' : 'Salvar Credenciais'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MercadoPagoSettingsPage;
