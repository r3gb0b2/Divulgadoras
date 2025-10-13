import React from 'react';
import { Link } from 'react-router-dom';

const CheckIcon: React.FC = () => (
    <svg className="w-5 h-5 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

const PricingPage: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto text-center">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                    Crie e Gerencie seus Próprios Eventos
                </h1>
                <p className="text-gray-400 mb-10 max-w-2xl mx-auto">
                    Escolha o plano ideal para você e comece a gerenciar suas divulgadoras de forma profissional e centralizada.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Plano Básico */}
                    <div className="flex flex-col p-8 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
                        <div className="flex-grow">
                            <h2 className="text-2xl font-bold text-primary">Básico</h2>
                            <p className="mt-2 text-gray-400">Para quem está começando</p>
                            <p className="mt-6 text-4xl font-bold text-white">R$ 49<span className="text-lg font-medium text-gray-400">/mês</span></p>

                            <ul className="mt-8 space-y-4 text-left">
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Até 5 eventos/gêneros ativos</span>
                                </li>
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Cadastro de até 500 divulgadoras</span>
                                </li>
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Painel de gerenciamento individual</span>
                                </li>
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Página de status para candidatas</span>
                                </li>
                            </ul>
                        </div>
                        <Link 
                            to="/organizacao-register" 
                            className="mt-8 block w-full py-3 px-6 text-center rounded-md text-white font-medium bg-gray-600 hover:bg-gray-500 transition-colors"
                        >
                            Começar agora
                        </Link>
                    </div>

                    {/* Plano Profissional */}
                    <div className="flex flex-col p-8 bg-gray-800 rounded-lg shadow-lg border-2 border-primary relative">
                        <span className="absolute top-0 -translate-y-1/2 bg-primary px-3 py-1 text-sm font-semibold tracking-wide text-white rounded-full">MAIS POPULAR</span>
                        <div className="flex-grow">
                            <h2 className="text-2xl font-bold text-primary">Profissional</h2>
                            <p className="mt-2 text-gray-400">Para agências e grandes eventos</p>
                            <p className="mt-6 text-4xl font-bold text-white">R$ 99<span className="text-lg font-medium text-gray-400">/mês</span></p>

                            <ul className="mt-8 space-y-4 text-left">
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Eventos/gêneros ilimitados</span>
                                </li>
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Divulgadoras ilimitadas</span>
                                </li>
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Adicione múltiplos administradores</span>
                                </li>
                                 <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">URL personalizada (opcional)</span>
                                </li>
                                <li className="flex items-center">
                                    <CheckIcon />
                                    <span className="ml-3 text-gray-300">Suporte prioritário via WhatsApp</span>
                                </li>
                            </ul>
                        </div>
                         <Link 
                            to="/organizacao-register" 
                            className="mt-8 block w-full py-3 px-6 text-center rounded-md text-white font-medium bg-primary hover:bg-primary-dark transition-colors"
                        >
                            Escolher plano Profissional
                        </Link>
                    </div>
                </div>

                <div className="mt-12">
                    <p className="text-gray-400">Dúvidas? <a href="#" className="text-primary hover:underline">Fale conosco</a>.</p>
                </div>
            </div>
        </div>
    );
};

export default PricingPage;
