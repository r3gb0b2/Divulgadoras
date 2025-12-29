
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon, SparklesIcon, CreditCardIcon, SearchIcon, EnvelopeIcon, ExternalLinkIcon, CheckCircleIcon } from '../components/Icons';

const StepCard: React.FC<{ number: string, icon: React.ElementType, title: string, description: string, color: string }> = ({ number, icon: Icon, title, description, color }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-[2rem] p-8 relative overflow-hidden group hover:border-primary transition-all shadow-xl">
        <div className={`absolute -top-4 -right-4 text-8xl font-black opacity-5 ${color}`}>{number}</div>
        <div className="flex flex-col gap-6 relative z-10">
            <div className={`w-14 h-14 rounded-2xl ${color} bg-opacity-20 flex items-center justify-center`}>
                <Icon className={`w-8 h-8 ${color.replace('bg-', 'text-')}`} />
            </div>
            <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed font-medium">{description}</p>
            </div>
        </div>
    </div>
);

const ClubVipHowItWorks: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-4xl mx-auto py-10 px-4 pb-24">
            <button onClick={() => navigate('/clubvip')} className="inline-flex items-center gap-2 text-[10px] font-black text-gray-500 hover:text-white transition-colors mb-10 uppercase tracking-widest">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar ao Clube</span>
            </button>

            <div className="text-center mb-16">
                <div className="p-4 bg-primary/10 rounded-full border border-primary/20 inline-block mb-6">
                    <SparklesIcon className="w-12 h-12 text-primary" />
                </div>
                <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">Como funciona o <span className="text-primary">VIP</span>?</h1>
                <p className="text-xl text-gray-400 font-medium">Entenda o passo a passo da sua adesão até a entrada no evento.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <StepCard 
                    number="01"
                    icon={SparklesIcon}
                    color="bg-blue-500"
                    title="Escolha sua Oferta"
                    description="Selecione o evento VIP desejado e preencha seus dados de identificação. Precisamos do seu e-mail e telefone corretos para liberar sua cortesia."
                />
                
                <StepCard 
                    number="02"
                    icon={CreditCardIcon}
                    color="bg-green-500"
                    title="Pagamento Instantâneo"
                    description="Realize o pagamento via Pix. O sistema identifica o valor automaticamente em segundos e já registra sua intenção de adesão."
                />

                <StepCard 
                    number="03"
                    icon={SearchIcon}
                    color="bg-purple-500"
                    title="Análise do Perfil"
                    description="Nossa equipe revisa seus dados e vincula seu e-mail ao sistema de ingressos oficial. Esse processo garante que sua cortesia seja exclusiva."
                />

                <StepCard 
                    number="04"
                    icon={EnvelopeIcon}
                    color="bg-indigo-500"
                    title="Ativação do Cupom"
                    description="Assim que aprovado, você recebe um e-mail de boas-vindas com seu código de cortesia oficial. O status no site muda para 'CORTESIA DISPONÍVEL'."
                />

                <StepCard 
                    number="05"
                    icon={ExternalLinkIcon}
                    color="bg-orange-500"
                    title="Resgate no Site"
                    description="No seu painel VIP, aparecerá o link direto. Clique nele para ir ao site de ingressos com o cupom já aplicado e garanta sua entrada."
                />

                <StepCard 
                    number="06"
                    icon={CheckCircleIcon}
                    color="bg-yellow-500"
                    title="Aproveite o Evento"
                    description="Com seu ingresso em mãos, basta apresentar na entrada do evento. Lembre-se: sua cortesia é pessoal e intransferível."
                />
            </div>

            <div className="mt-20 bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] text-center border border-white/5 shadow-2xl">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-6">Pronto para a experiência VIP?</h2>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button 
                        onClick={() => navigate('/clubvip')} 
                        className="px-10 py-5 bg-primary text-white font-black rounded-3xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/30 uppercase text-xs tracking-widest transform active:scale-95"
                    >
                        ESCOLHER MEU EVENTO
                    </button>
                    <button 
                        onClick={() => navigate('/status')} 
                        className="px-10 py-5 bg-gray-700 text-white font-black rounded-3xl hover:bg-gray-600 transition-all uppercase text-xs tracking-widest transform active:scale-95"
                    >
                        CONSULTAR STATUS ATUAL
                    </button>
                </div>
            </div>
            
            <p className="text-center text-gray-600 text-[10px] font-black uppercase tracking-[0.3em] mt-12">
                Clube VIP Oficial • Gestão Exclusiva de Benefícios
            </p>
        </div>
    );
};

export default ClubVipHowItWorks;
