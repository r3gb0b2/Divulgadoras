
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAllVipMemberships, getAllVipEvents } from '../services/vipService';
import { VipMembership, VipEvent, Timestamp } from '../types';
import { 
    TicketIcon, ChartBarIcon, ClockIcon, CheckCircleIcon, 
    XIcon, SparklesIcon, ArrowLeftIcon, RefreshIcon, UserIcon, FilterIcon 
} from '../components/Icons';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
};

const VipPublicDashboard: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedEventId, setSelectedEventId] = useState<string>('all');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [allMemb, allEvents] = await Promise.all([
                getAllVipMemberships(token === 'global' ? 'all' : token),
                getAllVipEvents()
            ]);
            setMemberships(allMemb);
            setEvents(allEvents);
        } catch (e) {
            console.error("Erro ao carregar relatório:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [token]);

    const stats = useMemo(() => {
        const filteredMemberships = selectedEventId === 'all' 
            ? memberships 
            : memberships.filter(m => m.vipEventId === selectedEventId);

        const confirmed = filteredMemberships.filter(m => m.status === 'confirmed');
        const pending = filteredMemberships.filter(m => m.status === 'pending');
        const refunded = filteredMemberships.filter(m => m.status === 'refunded');
        
        const FIXED_FEE = 4.00;

        const totalRevenueGross = confirmed.reduce((acc, curr) => {
            const event = events.find(e => e.id === curr.vipEventId);
            return acc + (event?.price || 0);
        }, 0);

        const totalFees = confirmed.length * FIXED_FEE;
        const totalRevenueNet = totalRevenueGross - totalFees;

        // Gerar os últimos 10 dias de forma sequencial e ordenada
        const last10Days: [string, number][] = [];
        const now = new Date();
        
        for (let i = 0; i < 10; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dateKey = d.toLocaleDateString('pt-BR');
            
            // Conta as vendas para este dia específico
            const count = confirmed.filter(m => {
                const pDate = toDateSafe(m.updatedAt || m.submittedAt);
                return pDate && pDate.toLocaleDateString('pt-BR') === dateKey;
            }).length;
            
            last10Days.push([dateKey, count]);
        }

        const conversionRate = filteredMemberships.length > 0 
            ? ((confirmed.length / filteredMemberships.length) * 100).toFixed(1) 
            : '0';

        return {
            totalLeads: filteredMemberships.length,
            totalSales: confirmed.length,
            totalPending: pending.length,
            totalRefunded: refunded.length,
            totalRevenueGross,
            totalFees,
            totalRevenueNet,
            conversionRate,
            activatedBenefits: confirmed.filter(m => m.isBenefitActive).length,
            dailySales: last10Days // Já está ordenado do mais recente para o mais antigo
        };
    }, [memberships, events, selectedEventId]);

    if (isLoading) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center">
            <RefreshIcon className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-gray-500 font-black uppercase text-[10px] tracking-widest">Calculando faturamento...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-black text-gray-200 p-4 md:p-10">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-primary/20 rounded-[1.5rem] flex items-center justify-center border border-primary/20 shadow-2xl">
                            <SparklesIcon className="w-10 h-10 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Métricas <span className="text-primary">VIP</span></h1>
                            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
                                <ClockIcon className="w-3 h-3" /> Transações Reais
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="relative group min-w-[240px]">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary">
                                <FilterIcon className="w-4 h-4" />
                            </div>
                            <select 
                                value={selectedEventId}
                                onChange={(e) => setSelectedEventId(e.target.value)}
                                className="w-full pl-12 pr-6 py-4 bg-gray-800 border border-white/10 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary transition-all appearance-none cursor-pointer"
                            >
                                <option value="all">TODOS OS EVENTOS</option>
                                {events.map(ev => (
                                    <option key={ev.id} value={ev.id}>
                                        {ev.name} - R$ {ev.price.toFixed(2).replace('.', ',')}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button onClick={fetchData} className="p-4 bg-gray-800 rounded-2xl hover:text-white transition-colors border border-white/5 flex items-center justify-center">
                            <RefreshIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* KPI Cards Principal */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-secondary/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                        <p className="text-gray-500 font-black uppercase text-[10px] tracking-[0.2em] mb-2">Faturamento Bruto</p>
                        <h2 className="text-4xl font-black text-white tracking-tighter">
                            R$ {stats.totalRevenueGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h2>
                        <p className="text-[9px] text-gray-600 font-bold uppercase mt-2">Valor total das adesões confirmadas</p>
                    </div>
                    
                    <div className="bg-secondary/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <XIcon className="w-12 h-12 text-red-500" />
                        </div>
                        <p className="text-red-400 font-black uppercase text-[10px] tracking-[0.2em] mb-2">Taxas Operacionais</p>
                        <h2 className="text-4xl font-black text-red-400 tracking-tighter">
                            - R$ {stats.totalFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h2>
                        <p className="text-[9px] text-gray-600 font-bold uppercase mt-2">R$ 4,00 por transação gateway</p>
                    </div>

                    <div className="bg-primary/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-primary/20 shadow-2xl ring-1 ring-primary/30">
                        <p className="text-primary font-black uppercase text-[10px] tracking-[0.2em] mb-2">Faturamento Líquido</p>
                        <h2 className="text-4xl font-black text-green-400 tracking-tighter">
                            R$ {stats.totalRevenueNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h2>
                        <p className="text-[9px] text-primary/60 font-black uppercase mt-2">Lucro real após taxas do gateway</p>
                    </div>
                </div>

                {/* KPI Cards Secundários */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-dark/40 p-6 rounded-3xl border border-white/5">
                        <p className="text-gray-500 font-black uppercase text-[8px] tracking-widest mb-1">Vendas Ativas</p>
                        <p className="text-2xl font-black text-white">{stats.totalSales}</p>
                    </div>
                    <div className="bg-dark/40 p-6 rounded-3xl border border-white/5">
                        <p className="text-gray-500 font-black uppercase text-[8px] tracking-widest mb-1">Conversão</p>
                        <p className="text-2xl font-black text-primary">{stats.conversionRate}%</p>
                    </div>
                    <div className="bg-dark/40 p-6 rounded-3xl border border-white/5">
                        <p className="text-gray-500 font-black uppercase text-[8px] tracking-widest mb-1">Pendentes</p>
                        <p className="text-2xl font-black text-orange-400">{stats.totalPending}</p>
                    </div>
                    <div className="bg-dark/40 p-6 rounded-3xl border border-white/5">
                        <p className="text-gray-500 font-black uppercase text-[8px] tracking-widest mb-1">Estornos</p>
                        <p className="text-2xl font-black text-red-500">{stats.totalRefunded}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Histórico Visual */}
                    <div className="lg:col-span-2 bg-secondary/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                        <div className="flex items-center gap-3 mb-8">
                            <ChartBarIcon className="w-6 h-6 text-primary" />
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Vendas por Dia</h3>
                        </div>
                        <div className="space-y-4">
                            {stats.dailySales.length === 0 ? (
                                <p className="text-center text-gray-600 py-10 font-bold uppercase text-xs">Nenhuma venda ativa no período</p>
                            ) : stats.dailySales.map(([date, count]) => (
                                <div key={date} className="flex items-center justify-between p-5 bg-dark/40 rounded-2xl border border-white/5 group hover:border-primary/20 transition-all">
                                    <span className="font-bold text-gray-300">{date}</span>
                                    <div className="flex items-center gap-4">
                                        <div className="h-2 w-32 bg-gray-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (count / (stats.totalSales || 1)) * 500)}%` }}></div>
                                        </div>
                                        <span className="font-black text-white">{count} vendas</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Breakdown de Saúde */}
                    <div className="bg-secondary/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col">
                        <h3 className="text-xl font-black text-white uppercase tracking-tight mb-8 flex items-center gap-3">
                            <FilterIcon className="w-6 h-6 text-primary" /> Funil de Conversão
                        </h3>
                        <div className="space-y-6 flex-grow">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                    <span>Total Interessados</span>
                                    <span>{stats.totalLeads}</span>
                                </div>
                                <div className="h-4 bg-dark rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-gray-500" style={{ width: '100%' }}></div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                    <span>Vendas Líquidas</span>
                                    <span>{stats.totalSales}</span>
                                </div>
                                <div className="h-4 bg-dark rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]" style={{ width: `${stats.conversionRate}%` }}></div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                    <span>Abandonos</span>
                                    <span>{stats.totalPending}</span>
                                </div>
                                <div className="h-4 bg-dark rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]" style={{ width: `${stats.totalLeads > 0 ? (stats.totalPending / stats.totalLeads) * 100 : 0}%` }}></div>
                                </div>
                            </div>
                             <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                    <span>Estornos</span>
                                    <span>{stats.totalRefunded}</span>
                                </div>
                                <div className="h-4 bg-dark rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-red-500" style={{ width: `${stats.totalLeads > 0 ? (stats.totalRefunded / stats.totalLeads) * 100 : 0}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 p-6 bg-red-900/10 border border-red-500/20 rounded-3xl text-center">
                            <p className="text-[10px] font-black text-red-300 uppercase leading-relaxed">
                                Regra aplicada: Faturamento bruto deduzindo R$ 4,00 por PIX confirmado. Adesões estornadas são 100% excluídas dos totais financeiros.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VipPublicDashboard;
