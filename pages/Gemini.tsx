import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeftIcon, SparklesIcon } from '../components/Icons';

const GeminiPage: React.FC = () => {
    const navigate = useNavigate();
    const [prompt, setPrompt] = useState('');
    const [response, setResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsLoading(true);
        setError(null);
        setResponse('');

        try {
            const askGemini = httpsCallable(functions, 'askGemini');
            const result = await askGemini({ prompt });
            const data = result.data as { text: string };
            setResponse(data.text);
        } catch (err: any) {
            console.error("Gemini function call failed:", err);
            const errorMessage = err.details?.message || err.message || 'Ocorreu um erro desconhecido.';
            setError(`Falha ao obter resposta: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
         <div>
            <div className="mb-6">
                 <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar</span>
                </button>
                <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
                    <SparklesIcon className="w-8 h-8 text-primary" />
                    Assistente Gemini
                </h1>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Use a inteligência artificial do Google para gerar ideias, criar textos para redes sociais, redigir regras para eventos e muito mais.
                </p>
                
                <form onSubmit={handleSubmit}>
                    <label htmlFor="gemini-prompt" className="block text-sm font-medium text-gray-300 mb-2">
                        Digite seu comando:
                    </label>
                    <textarea
                        id="gemini-prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ex: Crie um texto para Instagram convidando divulgadoras para um evento de música eletrônica em Ceará..."
                        rows={5}
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:bg-primary/50 disabled:cursor-wait"
                    >
                         {isLoading ? 'Pensando...' : 'Gerar Resposta'}
                         {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    </button>
                </form>
                
                <div className="mt-8">
                    {error && (
                        <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 rounded-md">
                            <p className="font-bold">Erro</p>
                            <p>{error}</p>
                        </div>
                    )}
                    {response && (
                         <div className="border-t border-gray-700 pt-6">
                             <h3 className="text-xl font-semibold text-white mb-4">Resposta:</h3>
                             <div className="bg-dark/70 p-4 rounded-lg">
                                 <pre className="text-gray-300 whitespace-pre-wrap font-sans text-base">
                                     {response}
                                 </pre>
                             </div>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GeminiPage;
