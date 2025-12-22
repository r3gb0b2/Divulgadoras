
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, DownloadIcon, MailIcon, CheckCircleIcon, KeyIcon } from '../components/Icons';

const StepCard: React.FC<{ number: string; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 relative overflow-hidden group">
        <div className="absolute -top-2 -right-2 text-6xl font-black opacity-5 text-primary">{number}</div>
        <div className="relative z-10">
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-xs">{number}</span>
                {title}
            </h3>
            <div className="text-gray-400 text-sm leading-relaxed">
                {children}
            </div>
        </div>
    </div>
);

const AppleInstallTutorial: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <button 
                onClick={() => navigate(-1)} 
                className="flex items-center gap-2 text-gray-500 hover:text-white transition-all mb-8 font-black text-xs uppercase tracking-widest"
            >
                <ArrowLeftIcon className="w-4 h-4" /> 
                <span>Voltar</span>
            </button>

            <div className="text-center mb-12">
                <h1 className="text-4xl font-black text-white uppercase tracking-tighter">
                    Como instalar no <span className="text-primary">iPhone</span>
                </h1>
                <p className="text-gray-400 mt-2 font-medium">Siga o passo a passo para acessar a versão beta.</p>
            </div>

            <div className="space-y-6">
                <StepCard number="01" title="Acesse seu E-mail">
                    <p>Procure na sua caixa de entrada por um e-mail enviado pela <strong>Apple TestFlight</strong>. O assunto será algo como <em>"Rafael Maciel Da Silva has invited you to test Equipe Certa"</em>.</p>
                    <div className="mt-4 p-3 bg-dark/50 rounded-xl border border-gray-700 flex items-center gap-3">
                        <MailIcon className="w-5 h-5 text-primary" />
                        <span className="text-[10px] font-mono">De: no_reply@email.apple.com</span>
                    </div>
                </StepCard>

                <StepCard number="02" title="Baixe o TestFlight">
                    <p>Antes de instalar nosso app, você precisa do aplicativo oficial de testes da Apple. Clique no botão abaixo ou procure por "TestFlight" na App Store.</p>
                    <a 
                        href="https://apps.apple.com/br/app/testflight/id899247664" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-xs uppercase"
                    >
                        <DownloadIcon className="w-4 h-4" /> Baixar TestFlight na App Store
                    </a>
                </StepCard>

                <StepCard number="03" title="Pegue seu Código">
                    <p>Dentro do e-mail que você recebeu, haverá um código de resgate único composto por 8 letras (ex: <strong>LRWDNGQW</strong>).</p>
                    <div className="mt-4 p-3 bg-primary/10 rounded-xl border border-primary/20 flex items-center justify-between">
                        <span className="text-xs font-bold text-primary uppercase">Procure por: "Redeem Code"</span>
                        <KeyIcon className="w-5 h-5 text-primary" />
                    </div>
                </StepCard>

                <StepCard number="04" title="Resgate e Instale">
                    <p>Abra o app <strong>TestFlight</strong>, clique em <strong>"Resgatar"</strong> (ou "Redeem") no canto superior direito e cole o código que você encontrou no e-mail.</p>
                    <div className="mt-4 p-4 bg-green-900/20 border border-green-500/30 rounded-xl">
                        <p className="text-green-400 font-bold text-xs flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4" /> Pronto! O botão "Instalar" aparecerá em seguida.
                        </p>
                    </div>
                </StepCard>
            </div>

            <div className="mt-12 bg-secondary p-8 rounded-[2.5rem] border border-gray-700 text-center">
                <h2 className="text-xl font-black text-white uppercase mb-4">Ainda não recebeu o convite?</h2>
                <p className="text-gray-400 text-sm mb-6">Verifique sua pasta de Spam. Se realmente não chegou, você precisa realizar o cadastro na página anterior usando seu e-mail do iCloud.</p>
                <button 
                    onClick={() => navigate('/apple-test')}
                    className="px-8 py-3 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-all text-xs uppercase"
                >
                    Ir para Cadastro Beta
                </button>
            </div>
        </div>
    );
};

export default AppleInstallTutorial;
