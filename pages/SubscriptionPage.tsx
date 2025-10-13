import React from 'react';
import { Link } from 'react-router-dom';

const SubscriptionPage: React.FC = () => {
    // These would typically come from your backend/payment provider API
    const subscription = {
        plan: 'Profissional',
        price: 'R$ 99/mês',
        status: 'Ativa',
        nextBillingDate: '25 de Julho, 2024',
        paymentMethod: {
            type: 'Cartão de Crédito',
            last4: '4242',
            expiry: '12/2026',
        }
    };

    const billingHistory = [
        { id: 'inv_1', date: '25 de Junho, 2024', description: 'Mensalidade Plano Profissional', amount: 'R$ 99,00', status: 'Paga' },
        { id: 'inv_2', date: '25 de Maio, 2024', description: 'Mensalidade Plano Profissional', amount: 'R$ 99,00', status: 'Paga' },
        { id: 'inv_3', date: '25 de Abril, 2024', description: 'Mensalidade Plano Profissional', amount: 'R$ 99,00', status: 'Paga' },
    ];
    
    const handleUpdatePayment = () => {
        alert('A integração com o portal de pagamentos ainda não foi implementada. Esta ação levaria o usuário para um checkout seguro para atualizar o cartão.');
    };
    
    const handleCancelSubscription = () => {
        if (window.confirm('Tem certeza que deseja cancelar sua assinatura? Você perderá o acesso aos recursos no final do ciclo de faturamento atual.')) {
            alert('Sua assinatura foi cancelada. Esta ação seria enviada ao backend para ser processada.');
        }
    };

    return (
        <div>
            <div className="mb-6">
                <Link to="/admin/settings" className="text-sm text-primary hover:underline">&larr; Voltar para Configurações</Link>
                <h1 className="text-3xl font-bold mt-1">Gerenciar Assinatura</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Current Plan & Payment */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-lg shadow">
                        <h3 className="text-xl font-semibold mb-4 text-white">Seu Plano Atual</h3>
                        <div className="space-y-3 text-gray-300">
                           <div className="flex justify-between"><span>Plano:</span> <span className="font-semibold text-primary">{subscription.plan}</span></div>
                           <div className="flex justify-between"><span>Preço:</span> <span className="font-semibold">{subscription.price}</span></div>
                           <div className="flex justify-between items-center">
                               <span>Status:</span> 
                               <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">{subscription.status}</span>
                           </div>
                           <div className="flex justify-between"><span>Próxima Cobrança:</span> <span className="font-semibold">{subscription.nextBillingDate}</span></div>
                        </div>
                    </div>
                    
                    <div className="bg-secondary p-6 rounded-lg shadow">
                        <h3 className="text-xl font-semibold mb-4 text-white">Forma de Pagamento</h3>
                        <p className="text-gray-300">{subscription.paymentMethod.type} terminando em <strong>{subscription.paymentMethod.last4}</strong></p>
                        <p className="text-sm text-gray-400">Expira em {subscription.paymentMethod.expiry}</p>
                        <button onClick={handleUpdatePayment} className="w-full mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                            Atualizar Forma de Pagamento
                        </button>
                    </div>

                    <div className="bg-secondary p-6 rounded-lg shadow border border-red-900/50">
                        <h3 className="text-xl font-semibold mb-2 text-red-400">Cancelar Assinatura</h3>
                        <p className="text-sm text-gray-400 mb-4">Esta ação não pode ser desfeita. Sua assinatura permanecerá ativa até o final do ciclo de faturamento atual.</p>
                        <button onClick={handleCancelSubscription} className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                            Cancelar Assinatura
                        </button>
                    </div>
                </div>

                {/* Right Column: Billing History */}
                <div className="lg:col-span-2 bg-secondary p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4 text-white">Histórico de Faturamento</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Data</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Descrição</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Valor</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {billingHistory.map(item => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{item.date}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{item.description}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{item.amount}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">{item.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionPage;
