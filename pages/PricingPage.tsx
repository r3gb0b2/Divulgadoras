
import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardDocumentListIcon, CogIcon, CheckCircleIcon, MegaphoneIcon, UsersIcon, SparklesIcon, TicketIcon } from '../components/Icons';


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
        name: 'Business',
        price: 247,
        priceFormatted: 'R$ 247',
        description: 'Ideal para produtores independentes e agências em crescimento.',
        features: [
            'Até 3 eventos simultâneos',
            'Gestão de até 1.000 divulgadoras',
            'Listas VIP e Aniversariantes',
            'Check-in por Foto e QR Code',
            'Suporte via E-mail'
        ],
        isPopular: false,
    },
    {
        id: 'professional',
        name: 'Enterprise',
        price: 497,
        priceFormatted: 'R$ 497',
        description: 'A solução completa para grandes produtoras e labels nacionais.',
        features: [
            'Eventos e Divulgadoras ILIMITADOS',
            'Módulo de Vendas Clube VIP',
            'Assistente de IA (Gemini API)',
            'Recuperação de Carrinhos via Zap',
            'Campanhas Push e Direct',
            'Suporte Prioritário 24/7'
        ],
        isPopular: true,
    }
];

const FeatureCard: React.FC<{ icon: React.ElementType, title: string, description: string }> = ({ icon: Icon, title, description }) => (
    <div className="bg-secondary/50 backdrop-blur-sm p-8 rounded-[2rem] border border-white/5 flex flex-col items-start text-left hover:border-primary/50 transition-all group">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-6 group-hover:scale-110 transition-transform">
            <Icon className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
);


const PricingPage: React.FC = () => {
    return (
        <div className="max-w-6xl mx-auto px-4 py-12">
            <div className="text-center mb-16 space-y-4">
                <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tighter">
                    Planos <span className="text-primary">Profissionais</span>
                </h1>
                <p className="text-xl text-gray-400 max-w-3xl mx-auto font-medium">
                    A tecnologia que as maiores labels de eventos do país utilizam para escalar suas equipes de divulgação.
                </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch mb-24">
                {plans.map((plan) => (
                    <div 
                        key={plan.id} 
                        className={`relative flex flex-col p-10 bg-secondary/40 backdrop-blur-xl rounded-[3rem] shadow-2xl border ${plan.isPopular ? 'border-primary ring-4 ring-primary/10' : 'border-white/5'}`}
                    >
                        {plan.isPopular && (
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                                <span className="bg-primary px-6 py-2 text-xs font-black tracking-widest text-white rounded-full uppercase shadow-xl">
                                    RECOMENDADO
                                </span>
                            </div>
                        )}
                        <div className="flex-grow">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tight">{plan.name}</h2>
                            <p className="mt-4 text-gray-400 font-medium leading-relaxed">{plan.description}</p>
                            
                            <div className="mt-10 flex items-baseline gap-1">
                                <span className="text-5xl font-black text-white">{plan.priceFormatted}</span>
                                <span className="text-lg font-bold text-gray-500 uppercase tracking-widest">/mês</span>
                            </div>

                            <ul className="mt-10 space-y-5">
                                {plan.features.map((feature, index) => (
                                    <li key={index} className="flex items-start">
                                        <div className="bg-green-500/20 p-1 rounded-md mr-4 mt-0.5">
                                            <CheckIcon className="w-4 h-4 text-green-500" />
                                        </div>
                                        <span className="text-gray-300 font-medium">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="mt-12">
                            <Link 
                                to={`/admin/register?plan=${plan.id}`}
                                className={`block w-full py-5 text-center rounded-2xl text-sm font-black uppercase tracking-[0.2em] transition-all transform hover:scale-[1.02] active:scale-95 ${plan.isPopular ? 'bg-primary text-white shadow-2xl shadow-primary/40' : 'bg-gray-800 text-white border border-white/5 hover:bg-gray-700'}`}
                            >
                                Iniciar Teste Grátis
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            {/* Features Section */}
            <div className="text-center space-y-16">
                <div className="space-y-4">
                    <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">
                        Por que migrar para a <span className="text-primary">Equipe Certa</span>?
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto">Tecnologia de ponta para eliminar o trabalho manual e focar na experiência do seu evento.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={ClipboardDocumentListIcon}
                        title="Gestão de Staff"
                        description="Formulários inteligentes com validação de perfil e aprovação em um clique. Chega de gerenciar equipe por conversa de WhatsApp."
                    />
                    <FeatureCard
                        icon={TicketIcon}
                        title="Clube VIP (Vendas)"
                        description="Venda adesões e ingressos promocionais diretamente para sua base de contatos. Faturamento real e imediato via Pix."
                    />
                    <FeatureCard
                        icon={MegaphoneIcon}
                        title="Engajamento Blindado"
                        description="Sistema que monitora se as divulgadoras realmente postaram e se mantiveram o post. Gere autoridade real para sua marca."
                    />
                    <FeatureCard
                        icon={UsersIcon}
                        title="Check-in Facial"
                        description="Segurança total na entrada. Identifique divulgadoras e convidados pelas fotos de cadastro, evitando fraudes e listas falsas."
                    />
                    <FeatureCard
                        icon={SparklesIcon}
                        title="Inteligência Artificial"
                        description="Assistente Gemini integrado para criar legendas, scripts de venda e estratégias de marketing para seus eventos."
                    />
                    <FeatureCard
                        icon={CogIcon}
                        title="Automação Zap"
                        description="Lembretes automáticos para quem esqueceu de enviar o print e recuperação de vendas para quem não finalizou o Pix."
                    />
                </div>
            </div>
            
            <div className="mt-24 p-10 bg-primary/5 rounded-[3rem] border border-primary/20 text-center space-y-6">
                <p className="text-gray-400 font-medium">
                    Precisa de uma solução personalizada ou volume muito alto de eventos?
                </p>
                <a href="https://wa.me/5585982280780" target="_blank" className="inline-block px-10 py-4 bg-white text-dark font-black rounded-2xl uppercase text-xs tracking-widest hover:bg-gray-200 transition-all">
                    Falar com Consultor &rarr;
                </a>
            </div>
        </div>
    );
};

export default PricingPage;
