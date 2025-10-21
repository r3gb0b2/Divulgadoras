

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmailTemplate, setEmailTemplate, resetEmailTemplate, sendCustomTestEmail, getDefaultEmailTemplate } from '../services/emailService';
import { ArrowLeftIcon, SparklesIcon } from '../components/Icons';
import { functions } from '../firebase/config';

const EmailTemplateEditor: React.FC = () => {
    const navigate = useNavigate();
    const [htmlContent, setHtmlContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isOutOfSync, setIsOutOfSync] = useState(false);


    // AI State
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const placeholders = [
        { variable: '{{promoterName}}', description: 'O nome completo da divulgadora.' },
        { variable: '{{promoterEmail}}', description: 'O e-mail da divulgadora.' },
        { variable: '{{campaignName}}', description: 'O nome do evento/gênero.' },
        { variable: '{{orgName}}', description: 'O nome da sua organização.' },
        { variable: '{{portalLink}}', description: 'O link único para o portal da divulgadora.' },
    ];

    const fetchTemplate = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setIsOutOfSync(false);
        try {
            const [userTemplate, defaultTemplate] = await Promise.all([
                getEmailTemplate(),
                getDefaultEmailTemplate()
            ]);
            
            setHtmlContent(userTemplate);

            // Check if user template might be outdated
            const userHasOldLink = userTemplate.includes('stingressos-e0a5f.web.app');
            const defaultHasNewLink = defaultTemplate.includes('divulgadoras.vercel.app');
            if (userHasOldLink && defaultHasNewLink) {
                setIsOutOfSync(true);
            }

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
    
    const handleSync = async () => {
        const confirmationMessage = isOutOfSync
          ? 'Esta ação substituirá o conteúdo do seu template pelo conteúdo padrão do sistema, que contém as correções de link mais recentes. Deseja continuar?'
          : 'Esta ação substituirá o conteúdo do seu template (a parte entre <body> e </body>) pelo conteúdo padrão do sistema. Seus estilos e head serão mantidos. Deseja continuar?';
          
        if (window.confirm(confirmationMessage)) {
            setIsSyncing(true);
            setError(null);
            try {
                const defaultHtml = await getDefaultEmailTemplate();
                
                const bodyContentRegex = /<body[^>]*>([\s\S]*?)<\/body>/i;
                const defaultBodyMatch = defaultHtml.match(bodyContentRegex);
                const currentUserBodyMatch = htmlContent.match(bodyContentRegex);

                if (defaultBodyMatch && currentUserBodyMatch) {
                    const defaultBodyContent = defaultBodyMatch[1];
                    // Replace only the inner content of the user's body tag
                    const newHtml = htmlContent.replace(currentUserBodyMatch[1], defaultBodyContent);
                    setHtmlContent(newHtml);
                    showSuccessMessage('Corpo do template sincronizado! Revise e clique em "Salvar Template".');
                } else {
                    // Fallback: if user template is malformed, just replace the whole thing
                    setHtmlContent(defaultHtml);
                    showSuccessMessage('Seu template parecia estar malformado. Substituímos pelo padrão do sistema. Revise e salve.');
                }
                setIsOutOfSync(false); // Hide warning after sync
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsSyncing(false);
            }
        }
    };


    const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) {
            setError('Por favor, digite um comando para a IA.');
            return;
        }
        setIsGenerating(true);
        setError(null);
        try {
            const fullPrompt = `
                Você é um desenvolvedor expert em HTML para e-mails. Sua tarefa é gerar ou modificar um template de e-mail HTML com base na solicitação do usuário.
                O HTML deve ter estilos inline para máxima compatibilidade com clientes de e-mail.
                A resposta DEVE ser apenas o código HTML bruto, sem explicações, comentários ou markdown (como \`\`\`html).

                Solicitação do Usuário: "${aiPrompt}"

                Template HTML atual (modifique a partir dele, se existir. Se a solicitação for para criar um novo, ignore este):
                \`\`\`html
                ${htmlContent}
                \`\`\`
            `;

            const askGemini = functions.httpsCallable('askGemini');
            const result = await askGemini({ prompt: fullPrompt });
            const data = result.data as { text: string };

            let newHtml = data.text.trim();
            if (newHtml.startsWith('```html')) {
                newHtml = newHtml.substring(7);
            }
            if (newHtml.endsWith('```')) {
                newHtml = newHtml.substring(0, newHtml.length - 3);
            }

            setHtmlContent(newHtml.trim());
            showSuccessMessage('HTML gerado com sucesso pela IA!');
        } catch (err: any) {
            console.error("Gemini function call failed:", err);
            const errorMessage = err.details?.originalError || err.message || 'Ocorreu um erro desconhecido.';
            setError(`Falha na geração com IA: ${errorMessage}`);
        } finally {
            setIsGenerating(false);
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

                 {isOutOfSync && (
                    <div className="bg-yellow-900/50 border-2 border-yellow-600 text-yellow-200 p-4 rounded-lg mb-6 flex flex-col sm:flex-row items-center gap-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.636-1.21 2.37-1.21 3.006 0l4.312 8.225c.606 1.157-.23 2.625-1.503 2.625H5.448c-1.273 0-2.109-1.468-1.503-2.625L8.257 3.099zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-grow">
                            <h3 className="font-bold text-lg">Ação Recomendada: Sincronize seu Template</h3>
                            <p className="text-sm">Detectamos que seu template de e-mail pode estar usando um link de portal desatualizado. Para garantir que as divulgadoras recebam o link correto, clique para sincronizar.</p>
                        </div>
                         <button onClick={handleSync} disabled={isSyncing} className="flex-shrink-0 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-semibold disabled:opacity-50 text-sm w-full sm:w-auto">
                            {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                        </button>
                    </div>
                )}

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
                    <div className="lg:col-span-1 space-y-6">
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
                        
                        <div className="border-t border-gray-700 pt-6">
                            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                                <SparklesIcon className="w-6 h-6 text-primary" />
                                Opção de Desenvolvedor (IA)
                            </h3>
                            <p className="text-sm text-gray-400 mb-4">
                                Peça para a IA criar um novo template ou melhorar o atual.
                            </p>
                            <textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Ex: Crie um template moderno e elegante para um festival de música eletrônica..."
                                rows={4}
                                className="w-full p-2 font-sans text-sm border border-gray-600 rounded-md bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <button
                                type="button"
                                onClick={handleAiGenerate}
                                disabled={isGenerating || isLoading || isSaving || isTesting || isSyncing}
                                className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-wait"
                            >
                                {isGenerating ? 'Gerando...' : 'Gerar com IA'}
                                {isGenerating && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-700 pt-4 flex flex-wrap gap-4 justify-end">
                    <button onClick={handleSync} disabled={isSaving || isTesting || isGenerating || isSyncing} className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-semibold disabled:opacity-50 text-sm">
                        {isSyncing ? 'Sincronizando...' : 'Sincronizar com Padrão'}
                    </button>
                    <button onClick={handleReset} disabled={isSaving || isTesting || isGenerating || isSyncing} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 font-semibold disabled:opacity-50 text-sm">
                        Redefinir para Padrão
                    </button>
                    <button onClick={handleSendTest} disabled={isSaving || isTesting || isGenerating || isSyncing} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:opacity-50 text-sm">
                        {isTesting ? 'Enviando...' : 'Enviar Teste'}
                    </button>
                    <button onClick={handleSave} disabled={isSaving || isTesting || isGenerating || isSyncing} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50 text-sm">
                         {isSaving ? 'Salvando...' : 'Salvar Template'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmailTemplateEditor;