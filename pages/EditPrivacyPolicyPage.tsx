
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPrivacyPolicy, updatePrivacyPolicy } from '../services/settingsService';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, ShieldCheckIcon } from '../components/Icons';

const EditPrivacyPolicyPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect non-superadmin
    useEffect(() => {
        if (adminData && adminData.role !== 'superadmin') {
            navigate('/admin');
        }
    }, [adminData, navigate]);

    useEffect(() => {
        const fetchPolicy = async () => {
            setIsLoading(true);
            try {
                const text = await getPrivacyPolicy();
                setContent(text);
            } catch (err: any) {
                setError("Erro ao carregar a política atual.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPolicy();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            await updatePrivacyPolicy(content);
            alert("Política de Privacidade atualizada com sucesso!");
        } catch (err: any) {
            setError(err.message || "Erro ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <ShieldCheckIcon className="w-8 h-8 text-primary" />
                    Editar Política de Privacidade
                </h1>
                <button onClick={() => navigate('/admin/dashboard')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar ao Dashboard</span>
                </button>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    O texto abaixo será exibido publicamente na página de Política de Privacidade do aplicativo. Você pode usar tags HTML básicas para formatação (ex: &lt;h2&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;ul&gt;).
                </p>

                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <>
                        {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4">{error}</div>}
                        
                        <textarea 
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full h-96 p-4 bg-gray-800 text-white border border-gray-600 rounded-md font-mono text-sm focus:ring-2 focus:ring-primary outline-none"
                            placeholder="Insira o texto da política de privacidade aqui (HTML suportado)..."
                        />

                        <div className="flex justify-end gap-4 mt-6 border-t border-gray-700 pt-4">
                            <button 
                                onClick={() => window.open('/#/politica-de-privacidade', '_blank')} 
                                className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-md hover:bg-gray-600"
                            >
                                Ver Página Pública
                            </button>
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50"
                            >
                                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default EditPrivacyPolicyPage;
