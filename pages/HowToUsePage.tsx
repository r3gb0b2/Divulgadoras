
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowLeftIcon, 
    UserPlusIcon, 
    SearchIcon, 
    WhatsAppIcon, 
    MegaphoneIcon, 
    CameraIcon, 
    ClipboardDocumentListIcon,
    TicketIcon,
    SparklesIcon
} from '../components/Icons';

const StepCard: React.FC<{ number: string, icon: React.ElementType, title: string, description: string, color: string }> = ({ number, icon: Icon, title, description, color }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 relative overflow-hidden group hover:border-primary transition-colors">
        <div className={`absolute -top-2 -right-2 text-6xl font-black opacity-10 ${color}`}>{number}</div>
        <div className="flex items-start gap-4 relative z-10">
            <div className={`p-3 rounded-lg ${color} bg-opacity-20 flex-shrink-0`}>
                <Icon className={`w-8 h-8 ${color.replace('bg-', 'text-')}`} />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
            </div>
        </div>
    </div>
);

const HowToUsePage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-4xl mx-auto p-4 pb-12">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-6">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>

            <div className="text-center mb-10">
                <h1 className="text-4xl font-extrabold text-white mb-4">Guia da Divulgadora</h1>
                <p className="text-lg text-gray-400">Tudo o que você precisa saber para brilhar na nossa equipe.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StepCard 
                    number="01"
                    icon={UserPlusIcon}
                    color="bg-blue-500"
                    title="Faça seu Cadastro"
                    description="Escolha a organização do evento no início do site, selecione seu estado e preencha seus dados. Capriche nas fotos de corpo e perfil, elas são essenciais para sua aprovação."
                />
                
                <StepCard 
                    number="02"
                    icon={SearchIcon}
                    color="bg-purple-500"
                    title="Acompanhe o Status"
                    description="Seu perfil passará por uma análise. Acesse o menu 'Status' e digite seu e-mail para saber se foi aprovada, se precisa corrigir algo ou se ainda está em análise."
                />

                <StepCard 
                    number="03"
                    icon={WhatsAppIcon}
                    color="bg-green-500"
                    title="Regras e Grupos"
                    description="Após ser aprovada, você deve ler as regras do evento e confirmar a leitura. Só então o link do grupo oficial de WhatsApp será liberado para você entrar."
                />

                <StepCard 
                    number="04"
                    icon={MegaphoneIcon}
                    color="bg-pink-500"
                    title="Pegue suas Tarefas"
                    description="No menu 'Admin' (ou seguindo o link enviado no grupo), você verá suas tarefas. Lá você baixa as artes (fotos/vídeos) e copia as instruções de postagem."
                />

                <StepCard 
                    number="05"
                    icon={CameraIcon}
                    color="bg-orange-500"
                    title="Envie as Comprovações"
                    description="Após postar, você deve clicar em 'Eu Postei'. O sistema aguardará 6 horas para liberar o botão de enviar o print (tempo necessário para o engajamento). Não esqueça de enviar!"
                />

                <StepCard 
                    number="06"
                    icon={ClipboardDocumentListIcon}
                    color="bg-indigo-500"
                    title="Listas de Convidados"
                    description="Alguns eventos liberam listas VIP. No seu painel de tarefas, você poderá inserir seu nome e os nomes dos seus convidados dentro do prazo estabelecido pelo organizador."
                />

                <StepCard 
                    number="07"
                    icon={TicketIcon}
                    color="bg-red-500"
                    title="Check-in no Evento"
                    description="No dia da festa, apresente-se na entrada. O organizador usará suas fotos de cadastro ou seu QR Code (se disponível) para validar sua entrada e a de seus convidados."
                />

                <StepCard 
                    number="08"
                    icon={SparklesIcon}
                    color="bg-yellow-500"
                    title="Dica de Ouro"
                    description="Mantenha um bom aproveitamento! Divulgadoras que postam sempre e não faltam ganham prioridade nos melhores eventos e maiores quantidades de convidados."
                />
            </div>

            <div className="mt-12 bg-secondary p-8 rounded-2xl text-center border-2 border-primary border-dashed">
                <h2 className="text-2xl font-bold text-white mb-4">Pronta para começar?</h2>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button 
                        onClick={() => navigate('/')} 
                        className="px-8 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-all"
                    >
                        Ir para o Início
                    </button>
                    <button 
                        onClick={() => navigate('/status')} 
                        className="px-8 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-all"
                    >
                        Verificar meu Status
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HowToUsePage;
