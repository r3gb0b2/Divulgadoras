import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPagSeguroStatus } from '../services/credentialsService';
import { ArrowLeftIcon, PagSeguroIcon } from '../components/Icons';

interface Status {
  configured: boolean;
  token: boolean;
  email: boolean;
}

const StatusIndicator: React.FC<{ valid: boolean; text: string; detail: string; }> = ({ valid, text, detail }) => (
    <div className={`flex items-start p-3 rounded-md border ${valid ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
        <div className="flex-shrink-0">
            {valid ? (
                <svg className="h-6 w-6 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
                <svg className="h-6 w-6 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
        </div>
        <div className="ml-3">
            <h3 className={`text-sm font-bold ${valid ? 'text-green-300' : 'text-red-300'}`}>{text}</h3>
            <p className="text-xs text-gray-400 mt-1">{detail}</p>
        </div>
    </div>
);


const PagSeguroSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStatus = async () => {
            setIsLoading(true);
            try {
                const statusData = await getPagSeguroStatus();
                setStatus(statusData as Status);
            } catch (err: any) {
                setError(err.message || 'Falha ao buscar status.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatus();
    }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
            <PagSeguroIcon className="w-8 h-auto"/>
            Configurações do PagSeguro
        </h1>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm flex items-center gap-2">
            <ArrowLeftIcon className="w-4 h-4" />
            Voltar ao Dashboard
        </button>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-4">
          Para habilitar pagamentos automáticos de assinatura, configure suas credenciais do PagSeguro no ambiente do Firebase.
        </p>
        <p className="text-sm text-yellow-400 bg-yellow-900/30 p-3 rounded-md mb-6">
          <strong>Atenção:</strong> As chaves de API são secretas e nunca devem ser expostas no código do aplicativo. Utilize o CLI do Firebase para configurá-las de forma segura no backend.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Status da Integração</h2>
                {isLoading ? <p>Verificando status...</p> : error ? <p className="text-red-400">{error}</p> : status && (
                    <div className="space-y-3">
                        <StatusIndicator valid={status.email} text="E-mail do PagSeguro" detail="E-mail da sua conta PagSeguro." />
                        <StatusIndicator valid={status.token} text="Token de Produção" detail="Necessário para criar pagamentos no backend." />
                    </div>
                )}
            </div>

             <div className="space-y-4 bg-dark/50 p-4 rounded-lg">
                <h2 className="text-xl font-semibold text-white">Como Configurar</h2>
                <div className="text-sm text-gray-300 space-y-3">
                    <p><strong>1.</strong> Acesse seu painel do PagSeguro e vá para "Venda Online" &gt; "Integrações".</p>
                    <p><strong>2.</strong> Gere e copie seu "Token de produção".</p>
                    <p><strong>3.</strong> No terminal, na pasta raiz do seu projeto Firebase, execute o comando abaixo, substituindo os valores:</p>
                    <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto text-xs">
                        <code>
                            {`firebase functions:config:set pagseguro.token="SEU_TOKEN_DE_PRODUCAO" pagseguro.email="seu@email.com"`}
                        </code>
                    </pre>
                     <p><strong>4.</strong> Após configurar, faça o deploy das funções para aplicar as alterações:</p>
                     <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto text-xs">
                        <code>
                            firebase deploy --only functions
                        </code>
                    </pre>
                    <p><strong>5.</strong> Atualize esta página para ver o novo status.</p>
                </div>
             </div>
        </div>
        
        <div className="mt-6 bg-blue-900/30 p-4 rounded-lg border border-blue-700">
            <h3 className="text-lg font-semibold text-blue-300">Observação Importante sobre a Liberação da API</h3>
            <p className="text-sm text-gray-300 mt-2">
                Mesmo com o token e e-mail configurados corretamente, sua conta PagSeguro pode precisar de uma liberação manual para aceitar pagamentos via API (Checkout Pro).
            </p>
            <p className="text-sm text-gray-300 mt-2">
                Se você encontrar um erro como <strong className="text-yellow-300">"whitelist access required"</strong> ao tentar realizar um pagamento, significa que você precisa entrar em contato com o suporte comercial do PagSeguro e solicitar a liberação da sua conta para produção.
            </p>
        </div>

      </div>
    </div>
  );
};

export default PagSeguroSettingsPage;