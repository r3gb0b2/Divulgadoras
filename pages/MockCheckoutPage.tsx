import React from 'react';
import { Link } from 'react-router-dom';

const CheckoutCompletePage: React.FC = () => {
    return (
        <div className="max-w-2xl mx-auto text-center">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">Pedido Recebido!</h1>
                <p className="text-gray-400 mb-6">
                    Seu pagamento está sendo processado pelo provedor de pagamento. Assim que for confirmado, sua conta será criada automaticamente.
                </p>
                <p className="text-sm text-gray-500 mb-8">
                    Isso geralmente leva apenas alguns instantes. Você pode fechar esta página e tentar fazer login em breve.
                </p>
                <Link 
                    to="/admin/login" 
                    className="inline-block w-full max-w-xs py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                    Ir para a Tela de Login
                </Link>
            </div>
        </div>
    );
};

// To maintain file structure, we're exporting this as the default.
// In App.tsx, this file is imported as CheckoutCompletePage.
export default CheckoutCompletePage;