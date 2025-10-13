import React, { useState } from 'react';
import PaymentModal from '../components/PaymentModal';

const CheckIcon: React.FC = () => (
    <svg className="w-5 h-5 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24" stroke="currentColor">
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

const plans: Plan[] = [
    {
        id: 'basic',
        name: 'Básico',
        price: 49,
        priceFormatted: 'R$ 49',
        description: 'Para quem está começando',
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
        description: 'Para agências e grandes eventos',
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

    const handleSelectPlan = (plan: Plan) => {
        setSelectedPlan(plan);
        setIsModalOpen(true);
    };

    return (
        <>
            <div className="max-w-4xl mx-auto text-center">
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-3xl font-bold text-gray-100 mb-2">
                        Crie e Gerencie seus Próprios Eventos
                    </h1>
                    <p className="text-gray-400 mb-10 max-w-2xl mx-auto">
                        Escolha o plano ideal para você e comece a gerenciar suas divulgadoras de forma profissional e centralizada.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {plans.map((plan) => (
                            <div key={plan.id} className={`flex flex-col p-8 bg-gray-800 rounded-lg shadow-lg border ${plan.isPopular ? 'border-2 border-primary' : 'border-gray-700'} relative`}>
                                {plan.isPopular && <span className="absolute top-0 -translate-y-1/2 bg-primary px-3 py-1 text-sm font-semibold tracking-wide text-white rounded-full">MAIS POPULAR</span>}
                                <div className="flex-grow">
                                    <h2 className="text-2xl font-bold text-primary">{plan.name}</h2>
                                    <p className="mt-2 text-gray-400">{plan.description}</p>
                                    <p className="mt-6 text-4xl font-bold text-white">{plan.priceFormatted}<span className="text-lg font-medium text-gray-400">/mês</span></p>

                                    <ul className="mt-8 space-y-4 text-left">
                                        {plan.features.map((feature, index) => (
                                            <li key={index} className="flex items-center">
                                                <CheckIcon />
                                                <span className="ml-3 text-gray-300">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <button 
                                    onClick={() => handleSelectPlan(plan)}
                                    className={`mt-8 block w-full py-3 px-6 text-center rounded-md text-white font-medium ${plan.isPopular ? 'bg-primary hover:bg-primary-dark' : 'bg-gray-600 hover:bg-gray-500'} transition-colors`}
                                >
                                    Começar agora
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12">
                        <p className="text-gray-400">Dúvidas? <a href="#" className="text-primary hover:underline">Fale conosco</a>.</p>
                    </div>
                </div>
            </div>

            <PaymentModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                plan={selectedPlan}
            />
        </>
    );
};

export default PricingPage;