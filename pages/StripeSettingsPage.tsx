import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStripeStatus, getEnvironmentConfig } from '../services/credentialsService';
import { ArrowLeftIcon, CreditCardIcon } from '../components/Icons';

interface Status {
  configured: boolean;
  secretKey: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  basicPriceId: boolean;
  professionalPriceId: boolean;
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


const StripeSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Debug state
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [debugError, setDebugError] = useState('');


    useEffect(() => {
        const fetchStatus = async () => {
            setIsLoading(true);
            try {
                const statusData = await getStripeStatus();
                setStatus(statusData as Status);
            } catch (err: any) {
                setError(err.message || 'Falha ao buscar status.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const handleVerifyConfig = async () => {
        setIsVerifying(true);
        setDebugError('');
        setDebugInfo(null);
        try {
            const config = await getEnvironmentConfig();
            setDebugInfo(config);
        } catch(err: any) {
            setDebugError(err.message || "Falha ao buscar configuração.");
        } finally {
            setIsVerifying(false);
        }
    }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
            <CreditCardIcon className="w-8 h-auto"/>
            Configurações do Stripe
        </h1>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm flex items-center gap-2">
            <ArrowLeftIcon className="w-4 h-4" />
            Voltar ao Dashboard
        </button>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-4">
          Para habilitar pagamentos automáticos de assinatura, configure suas credenciais do Stripe no ambiente do Firebase.
        </p>
        <p className="text-sm text-yellow-400 bg-yellow-900/30 p-3 rounded-md mb-6">
          <strong>Atenção:</strong> As chaves de API são secretas e nunca devem ser expostas no código do aplicativo. Utilize o CLI do Firebase para configurá-las de forma segura no backend.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Status da Integração</h2>
                {isLoading ? <p>Verificando status...</p> : error ? <p className="text-red-400">{error}</p> : status && (
                    <div className="space-y-3">
                        <StatusIndicator valid={status.secretKey} text="Secret Key" detail="Necessária para criar pagamentos no backend." />
                        <StatusIndicator valid={status.publishableKey} text="Publishable Key" detail="Necessária para o frontend redirecionar para o checkout." />
                        <StatusIndicator valid={status.webhookSecret} text="Webhook Secret" detail="Essencial para validar notificações de pagamento do Stripe." />
                        <StatusIndicator valid={status.basicPriceId} text="Price ID (Básico)" detail="ID do preço para o plano Básico no Stripe." />
                        <StatusIndicator valid={status.professionalPriceId} text="Price ID (Profissional)" detail="ID do preço para o plano Profissional no Stripe." />
                    </div>
                )}
            </div>

             <div className="space-y-4 bg-dark/50 p-4 rounded-lg">
                <h2 className="text-xl font-semibold text-white">Como Configurar</h2>
                <div className="text-sm text-gray-300 space-y-3">
                    <p><strong>1.</strong> Crie dois produtos no seu <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Dashboard Stripe</a>: "Plano Básico" e "Plano Profissional", com seus respectivos preços mensais.</p>
                    <p><strong>2.</strong> Acesse a seção <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">API Keys</a> e copie sua "Secret key" e "Publishable key".</p>
                    <p><strong>3.</strong> Vá para <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Webhooks</a>, adicione um endpoint para a URL da sua função `stripeWebhook`, e copie o "Signing secret".</p>
                    <p><strong>4.</strong> No terminal, na pasta raiz do seu projeto Firebase, execute o comando abaixo com suas chaves:</p>
                    <pre className="bg-black/50 p-3 rounded-md text-white mt-2 overflow-x-auto text-xs">
                        <code>
                            {`firebase functions:config:set stripe.secret_key="sk_..." stripe.publishable_key="pk_..." stripe.webhook_secret="whsec_..." stripe.basic_price_id="price_..." stripe.professional_price_id="price_..."`}
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

        {/* Debug Section */}
        <div className="mt-8 border-t border-gray-700 pt-6">
            <h2 className="text-xl font-semibold text-white">Debug</h2>
            <p className="text-sm text-gray-400 mt-2 mb-4">Se os pagamentos continuam falhando mesmo com o status acima parecendo correto, use esta ferramenta para ver os valores exatos que o servidor está usando. Isso ajuda a confirmar se o deploy da configuração foi bem-sucedido.</p>
            <button
                onClick={handleVerifyConfig}
                disabled={isVerifying}
                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
                {isVerifying ? "Verificando..." : "Verificar Configuração do Servidor"}
            </button>
            {debugError && <p className="text-red-400 text-sm mt-4">{debugError}</p>}
            {debugInfo && (
                <div className="mt-4">
                    <h3 className="text-lg font-semibold text-white">Informações de Debug do Servidor</h3>
                    <p className="text-xs text-yellow-400 mb-2">Verifique se os valores de `basic_price_id` e `professional_price_id` começam com `price_` e não `prod_`.</p>
                    <pre className="bg-black/50 p-4 rounded-md text-white text-xs whitespace-pre-wrap">
                        {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default StripeSettingsPage;