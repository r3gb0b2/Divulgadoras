import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMercadoPagoStatus } from '../services/credentialsService';
import { ArrowLeftIcon, MercadoPagoIcon } from '../components/Icons';

interface Status {
  configured: boolean;
  publicKey: boolean;
  token: boolean;
  webhookSecret: boolean;
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


const MercadoPagoSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStatus = async () => {
            setIsLoading(true);
            try {
                const statusData = await getMercadoPagoStatus();
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
            <MercadoPagoIcon className="w-8 h-auto"/>
            Configurações do Mercado Pago
        </h1>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm flex items-center gap-2">
            <ArrowLeftIcon className="w-4 h-4" />
            Voltar ao Dashboard
        </button>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-4">
          Para habilitar pagamentos automáticos de assinatura, configure suas credenciais do Mercado Pago no ambiente do Firebase.
        </p>
        <p className="text-sm text-yellow-400 bg-yellow-900/30 p-3 rounded-md mb-6">
          <strong>Atenção:</strong> As chaves de API são secretas e nunca devem ser expostas no código do aplicativo. Utilize o CLI do Firebase para configurá-las de forma segura no backend.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Status da Integração</h2>
                {isLoading ? <p>Verificando status...</p> : error ? <p className="text-red-400">{error}</p> : status && (
                    <div className="space-y-3">
                        <StatusIndicator valid={status.token} text="Access Token" detail="Necessário para criar pagamentos no backend." />
                        <StatusIndicator valid={status.publicKey} text="Public Key" detail="Necessária para renderizar o checkout no frontend." />
                        <StatusIndicator valid={status.webhookSecret} text="Webhook Secret" detail="Recomendado para validar notificações de pagamento." />
                    </div>
                )}
            </div>

             <div className="space-y-4 bg-dark/50 p-4 rounded-lg">
                <h2 className="text-xl font-semibold text-white">Como Configurar</h2>
                <div className="text-sm text-gray-300 space-y-3">
                    <p><strong>1.</strong> Acesse suas <a href="https://www.mercadopago.com.br/developers/panel/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Credenciais de Produção</a> no painel do Mercado Pago.</p>
                    <p><strong>2.</strong> Copie seu "Access Token" e "Public Key".</p>
                    <p><strong>3.</strong> Crie uma "secret" para o webhook (uma senha forte que você inventar).</p>
                    <p><strong>4.</strong> No terminal, na pasta raiz do seu projeto Firebase, execute o comando abaixo, substituindo os valores:</p>
                    <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto text-xs">
                        <code>
                            {`firebase functions:config:set mercadopago.token="PROD_ACCESS_TOKEN" mercadopago.public_key="PROD_PUBLIC_KEY" mercadopago.webhook_secret="SUA_SENHA_WEBHOOK"`}
                        </code>
                    </pre>
                     <p><strong>5.</strong> Após configurar, faça o deploy das funções para aplicar as alterações:</p>
                     <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto text-xs">
                        <code>
                            firebase deploy --only functions
                        </code>
                    </pre>
                    <p><strong>6.</strong> Atualize esta página para ver o novo status.</p>
                </div>
             </div>
        </div>

      </div>
    </div>
  );
};

export default MercadoPagoSettingsPage;