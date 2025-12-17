
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, MailIcon, WhatsAppIcon } from '../components/Icons';

const SupportPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-4xl mx-auto p-6">
            <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-6">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar ao Início</span>
            </button>

            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-white mb-6 border-b border-gray-700 pb-4">Suporte e Ajuda</h1>

                <div className="space-y-8">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">Fale Conosco</h2>
                        <p className="text-gray-300 mb-4">
                            Está enfrentando problemas técnicos, encontrou um bug ou tem alguma dúvida sobre o aplicativo? Nossa equipe está pronta para ajudar.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-gray-800 p-4 rounded-lg flex items-center gap-4 border border-gray-700">
                                <div className="p-3 bg-gray-700 rounded-full text-green-400">
                                    <WhatsAppIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-400">WhatsApp</p>
                                    <p className="text-white font-medium">(11) 99999-9999</p>
                                    <p className="text-xs text-gray-500">Seg a Sex, 09h às 18h</p>
                                </div>
                            </div>

                            <div className="bg-gray-800 p-4 rounded-lg flex items-center gap-4 border border-gray-700">
                                <div className="p-3 bg-gray-700 rounded-full text-blue-400">
                                    <MailIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-400">E-mail</p>
                                    <p className="text-white font-medium">suporte@equipecerta.com</p>
                                    <p className="text-xs text-gray-500">Resposta em até 24h úteis</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">Perguntas Frequentes (FAQ)</h2>
                        <div className="space-y-4">
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50">
                                <h3 className="font-bold text-gray-200">Não consigo fazer login. O que fazer?</h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    Verifique se você está utilizando o e-mail correto cadastrado. Se for um organizador, confirme se sua conta já foi aprovada. Se o problema persistir, entre em contato via WhatsApp.
                                </p>
                            </div>
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50">
                                <h3 className="font-bold text-gray-200">Como faço para recuperar minha senha?</h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    Por questões de segurança, a redefinição de senha deve ser solicitada diretamente ao administrador da sua organização ou através do nosso suporte por e-mail.
                                </p>
                            </div>
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50">
                                <h3 className="font-bold text-gray-200">Como apagar minha conta e meus dados?</h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    Respeitamos sua privacidade. Para solicitar a exclusão completa da sua conta e de todos os seus dados pessoais do nosso sistema, envie um e-mail para <strong>suporte@equipecerta.com</strong> com o assunto "Exclusão de Conta".
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default SupportPage;
