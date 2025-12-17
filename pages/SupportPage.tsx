
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, MailIcon, WhatsAppIcon, ShieldCheckIcon, LockClosedIcon, ServerIcon } from '../components/Icons';

const SupportPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-4xl mx-auto p-6">
            <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-6">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar ao Início</span>
            </button>

            <div className="space-y-8">
                {/* Seção de Contato */}
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-3xl font-bold text-white mb-6 border-b border-gray-700 pb-4">Suporte e Ajuda</h1>

                    <section className="mb-8">
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

                {/* Nova Seção de Segurança */}
                <div className="bg-secondary shadow-2xl rounded-lg p-8 border-t-4 border-primary">
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                        <ShieldCheckIcon className="w-8 h-8 text-primary" />
                        Segurança e Criptografia
                    </h2>
                    
                    <p className="text-gray-300 mb-6">
                        Levamos a segurança dos seus dados a sério. Abaixo detalhamos os padrões técnicos de proteção utilizados no Equipe Certa.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gray-800 p-5 rounded-lg border border-gray-700">
                            <div className="text-blue-400 mb-3"><LockClosedIcon className="w-8 h-8"/></div>
                            <h3 className="font-bold text-white mb-2">Dados em Trânsito</h3>
                            <p className="text-sm text-gray-400">
                                Toda a comunicação entre seu dispositivo e nossos servidores é criptografada utilizando o padrão <strong>HTTPS (TLS 1.2/1.3)</strong>. Isso garante que ninguém possa interceptar suas informações durante o uso do app.
                            </p>
                        </div>

                        <div className="bg-gray-800 p-5 rounded-lg border border-gray-700">
                            <div className="text-green-400 mb-3"><ServerIcon className="w-8 h-8"/></div>
                            <h3 className="font-bold text-white mb-2">Dados em Repouso</h3>
                            <p className="text-sm text-gray-400">
                                Seus dados e imagens são armazenados nos servidores do Google Cloud (Firestore e Storage), protegidos por criptografia automática <strong>AES-256</strong> em nível de infraestrutura.
                            </p>
                        </div>

                        <div className="bg-gray-800 p-5 rounded-lg border border-gray-700">
                            <div className="text-purple-400 mb-3"><ShieldCheckIcon className="w-8 h-8"/></div>
                            <h3 className="font-bold text-white mb-2">Pagamentos Seguros</h3>
                            <p className="text-sm text-gray-400">
                                O processamento de pagamentos é realizado pelo Stripe. Nós <strong>não armazenamos</strong> números de cartão de crédito. Seguimos os padrões PCI-DSS de segurança.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupportPage;
