import React from 'react';
import { Link } from 'react-router-dom';

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-6 h-6 ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

export interface Plan {
    id: string;
    name: string;
    price: number;
    priceFormatted: string;
    description: string;
    features: string[];
    isPopular: boolean;
}

export const plans: Plan[] = [
    {
        id: 'basic',
        name: 'Básico',
        price: 49,
        priceFormatted: 'R$ 49',
        description: 'Ideal para quem está começando e precisa de uma solução profissional.',
        features: [
            'Até 5 eventos/gêneros ativos',
            'Cadastro de até 500 divulgadoras',
            'Painel de gerenciamento individual',
            'Página de status para candidatas',
        ],
        isPopular: false,
    },
    {
        id: 'professional',
        name: 'Profissional',
        price: 99,
        priceFormatted: 'R$ 99',
        description: 'Recursos avançados para agências e grandes eventos que buscam escala.',
        features: [
            'Eventos/gêneros ilimitados',
            'Divulgadoras ilimitadas',
            'Adicione múltiplos administradores',
            'URL personalizada (opcional)',
            'Suporte prioritário via WhatsApp',
        ],
        isPopular: true,
    }
];

const PricingPage: React.FC = () => {
    return (
        <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
                    Planos flexíveis para o seu sucesso
                </h1>
                <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                    Escolha o plano que melhor se adapta ao tamanho do seu evento e comece a gerenciar suas divulgadoras de forma inteligente.
                </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {plans.map((plan) => (
                    <div 
                        key={plan.id} 
                        className={`relative flex flex-col p-8 bg-secondary rounded-xl shadow-2xl border ${plan.isPopular ? 'border-2 border-primary' : 'border-gray-700'}`}
                    >
                        {plan.isPopular && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                <span className="bg-primary px-4 py-1.5 text-sm font-semibold tracking-wide text-white rounded-full uppercase shadow-md">
                                    Mais Popular
                                </span>
                            </div>
                        )}
                        <div className="flex-grow">
                            <h2 className="text-3xl font-bold text-white">{plan.name}</h2>
                            <p className="mt-4 text-gray-400 h-16">{plan.description}</p>
                            
                            <div className="mt-8">
                                <span className="text-5xl font-extrabold text-white">{plan.priceFormatted}</span>
                                <span className="text-xl font-medium text-gray-400">/mês</span>
                            </div>

                            <ul className="mt-8 space-y-4">
                                {plan.features.map((feature, index) => (
                                    <li key={index} className="flex items-start">
                                        <CheckIcon className="w-6 h-6 text-green-400 flex-shrink-0 mr-3 mt-1" />
                                        <span className="text-gray-300">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="mt-10">
                            <Link 
                                to={`/subscribe/${plan.id}`}
                                className={`block w-full py-4 px-6 text-center rounded-lg text-lg font-semibold transition-transform duration-300 transform hover:scale-105 ${plan.isPopular ? 'bg-primary text-white shadow-lg hover:bg-primary-dark' : 'bg-gray-600 text-gray-100 hover:bg-gray-500'}`}
                            >
                                Iniciar Teste Gratuito
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-16 text-center">
                <p className="text-gray-400">
                    Todos os planos incluem um teste gratuito de 3 dias. Sem compromisso, cancele quando quiser.
                </p>
                <p className="text-gray-400 mt-2">
                    Dúvidas? <a href="#" className="font-semibold text-primary hover:underline">Entre em contato com nosso suporte</a>.
                </p>
            </div>
        </div>
    );
};

export default PricingPage;