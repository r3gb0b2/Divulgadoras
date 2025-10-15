import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmailTemplate, setEmailTemplate, resetEmailTemplate, sendCustomTestEmail } from '../services/emailService';
import { ArrowLeftIcon, SparklesIcon } from '../components/Icons';

const EmailTemplateEditor: React.FC = () => {
    const navigate = useNavigate();
    const [htmlContent, setHtmlContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const placeholders = [
        { variable: '{{promoterName}}', description: 'O nome completo da divulgadora.' },
        { variable: '{{campaignName}}', description: 'O nome do evento/gênero.' },
        { variable: '{{orgName}}', description: 'O nome da sua organização.' },
        { variable: '{{portalLink}}', description: 'O link único para o portal da divulgadora.' },
    ];

    const fetchTemplate = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const content = await getEmailTemplate();
            setHtmlContent(content);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTemplate();
    }, [fetchTemplate]);

    const showSuccessMessage = (message: string) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            await setEmailTemplate(htmlContent);
            showSuccessMessage('Template salvo com sucesso!');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleReset = async () => {
        if (window.confirm('Tem certeza que deseja redefinir o template para o padrão do sistema? Suas alterações serão perdidas.')) {
            setIsSaving(true);
            setError(null);
            try {
                await resetEmailTemplate();
                await fetchTemplate(); // Reload the default template
                showSuccessMessage('Template redefinido para o padrão.');
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleSendTest = async () => {
        setIsTesting(true);
        setError(null);
        try {
            const result = await sendCustomTestEmail(htmlContent);
            showSuccessMessage(result.message || 'E-mail de teste enviado com sucesso!');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsTesting(false);
        }
    };


    return (
        <div>
            <div className="mb-6">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar ao Dashboard</span>
                </button>
                <h1 className="text-3xl font-bold mt-1">Editor de Template de E-mail (Aprovação)</h1>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
                 {successMessage && <div className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4 text-sm font-semibold">{successMessage}</div>}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <label htmlFor="html-editor" className="block text-sm font-medium text-gray-300 mb-2">
                            Conteúdo HTML do E-mail
                        </label>
                        {isLoading ? (
                            <div className="w-full h-96 bg-gray-800 rounded-md flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                        ) : (
                            <textarea
                                id="html-editor"
                                value={htmlContent}
                                onChange={(e) => setHtmlContent(e.target.value)}
                                placeholder="Cole seu código HTML aqui..."
                                className="w-full h-96 p-3 font-mono text-sm border border-gray-600 rounded-md bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                                spellCheck="false"
                            />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Variáveis Disponíveis</h3>
                        <p className="text-sm text-gray-400 mb-4">Use estas variáveis no seu HTML. Elas serão substituídas pelos dados reais da divulgadora.</p>
                        <div className="space-y-3">
                            {placeholders.map(p => (
                                <div key={p.variable} className="p-3 bg-gray-700/50 rounded-md">
                                    <code className="font-semibold text-primary">{p.variable}</code>
                                    <p className="text-xs text-gray-300 mt-1">{p.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-700 pt-4 flex flex-wrap gap-4 justify-end">
                    <button onClick={handleReset} disabled={isSaving || isTesting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 font-semibold disabled:opacity-50 text-sm">
                        Redefinir para Padrão
                    </button>
                    <button onClick={handleSendTest} disabled={isSaving || isTesting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:opacity-50 text-sm">
                        {isTesting ? 'Enviando...' : 'Enviar Teste'}
                    </button>
                    <button onClick={handleSave} disabled={isSaving || isTesting} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50 text-sm">
                         {isSaving ? 'Salvando...' : 'Salvar Template'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmailTemplateEditor;