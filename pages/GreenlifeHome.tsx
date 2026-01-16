
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
import { getActiveGreenlifeEvents, checkGreenlifeMembership, getGreenlifeCodeStats } from '../services/greenlifeService';
import { Promoter, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
  ArrowLeftIcon, CheckCircleIcon, SparklesIcon,
  UserIcon, PhoneIcon, InstagramIcon,
  AlertTriangleIcon, SearchIcon, RefreshIcon, DocumentDuplicateIcon
} from '../components/Icons';

const GreenlifeHome: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<'select_event' | 'identify' | 'confirm_data' | 'payment' | 'success'>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [selectedEvent, setSelectedEvent] = useState<VipEvent | null>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [taxId, setTaxId] = useState(''); 
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pixData, setPixData] = useState<any>(null);
    const [promoter, setPromoter] = useState<any>(null);
    const [currentCheckoutId, setCurrentCheckoutId] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getActiveGreenlifeEvents();
                setEvents(data);
                const stocks: Record<string, number> = {};
                for (const ev of data) {
                    stocks[ev.id] = await getGreenlifeCodeStats(ev.id);
                }
                setStockMap(stocks);
            } catch (err) { setError("Falha ao carregar."); } finally { setIsLoading(false); }
        };
        loadData();
    }, []);

    useEffect(() => {
        if (step === 'payment' && currentCheckoutId) {
            const unsubscribe = firestore.collection('checkouts').doc(currentCheckoutId).onSnapshot(doc => {
                if (doc.data()?.status === 'confirmed') { setStep('success'); }
            });
            return () => unsubscribe();
        }
    }, [step, currentCheckoutId]);

    const handleCheckEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const trimmed = email.trim().toLowerCase();
            const membership = await checkGreenlifeMembership(trimmed, selectedEvent!.id);
            if (membership?.status === 'confirmed') { navigate('/alunosgreenlife/status'); return; }
            const profiles = await findPromotersByEmail(trimmed);
            if (profiles.length > 0) {
                const p = profiles[0];
                setPromoter(p);
                setName(p.name);
                setWhatsapp(p.whatsapp);
            }
            setStep('confirm_data');
        } finally { setIsLoading(false); }
    };

    const handleProceedToPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            let pId = promoter?.id;
            if (!pId) pId = await createVipPromoter({ name, email, whatsapp });
            const createGreenlifePagarMePix = httpsCallable(functions, 'createGreenlifePagarMePix');
            const res: any = await createGreenlifePagarMePix({
                vipEventId: selectedEvent!.id,
                promoterId: pId,
                email: email.toLowerCase().trim(),
                name, whatsapp, taxId,
                amount: selectedEvent!.price,
                quantity: 1
            });
            setPixData(res.data);
            setCurrentCheckoutId(res.data.checkoutId);
            setStep('payment');
        } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
    };

    return (
        <div className="max-w-2xl mx-auto py-10 px-4">
            <div className="bg-secondary rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-green-600 p-12 text-center border-b border-green-500/20">
                    <SparklesIcon className="w-16 h-16 text-white mx-auto mb-4 opacity-50" />
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter">ALUNOS <span className="text-gray-200">GREENLIFE</span></h1>
                </div>

                <div className="p-10">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4">
                            <RefreshIcon className="w-10 h-10 text-green-500 animate-spin" />
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Carregando Planos...</p>
                        </div>
                    ) : step === 'select_event' && (
                        <div className="space-y-6">
                            <div className="flex justify-center mb-4">
                                <Link to="/alunosgreenlife/status" className="px-6 py-3 bg-gray-800 text-gray-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-gray-700 transition-all">Meus Ingressos</Link>
                            </div>
                            <div className="grid gap-4">
                                {events.map(ev => {
                                    const stock = stockMap[ev.id] ?? 0;
                                    const isSoldOut = stock === 0 || ev.saleStatus === 'sold_out';
                                    const isLowStock = !isSoldOut && ev.saleStatus === 'low_stock';

                                    return (
                                        <button key={ev.id} onClick={() => { if(!isSoldOut) { setSelectedEvent(ev); setStep('identify'); } }} disabled={isSoldOut} className={`p-8 rounded-[2rem] border flex justify-between items-center transition-all ${isSoldOut ? 'bg-gray-800/10 border-white/5 cursor-not-allowed opacity-50' : 'bg-dark/60 border-white/5 hover:border-green-500 shadow-xl'}`}>
                                            <div className="text-left flex-grow pr-4">
                                                <p className={`font-black text-xl uppercase ${isSoldOut ? 'text-gray-500' : 'text-white'}`}>{ev.name}</p>
                                                <p className="text-[10px] text-gray-500 font-black uppercase mt-1">Adesão Aluno</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {isSoldOut ? (
                                                    <>
                                                        <span className="text-[26px] text-gray-500 font-black line-through leading-none">R$ {ev.price.toFixed(2).replace('.', ',')}</span>
                                                        <span className="px-5 py-2 bg-red-600 text-white text-[11px] font-black uppercase rounded-2xl">ESGOTADO</span>
                                                    </>
                                                ) : isLowStock ? (
                                                    <>
                                                        <p className="text-green-500 font-black text-2xl leading-none">R$ {ev.price.toFixed(2)}</p>
                                                        <span className="px-5 py-2 bg-yellow-600 text-white text-[11px] font-black uppercase rounded-2xl animate-soft-flash">ESGOTANDO</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-green-500 font-black text-2xl leading-none">R$ {ev.price.toFixed(2)}</p>
                                                        <span className="px-5 py-2 bg-green-600 text-white text-[11px] font-black uppercase rounded-2xl">DISPONÍVEL</span>
                                                    </>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleCheckEmail} className="space-y-6 text-center">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Identificação</h2>
                            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white text-center text-xl font-black outline-none focus:ring-2 focus:ring-green-500" placeholder="seu@email.com" />
                            <button type="submit" className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase shadow-xl transition-all">CONTINUAR</button>
                        </form>
                    )}

                    {step === 'confirm_data' && (
                        <form onSubmit={handleProceedToPayment} className="space-y-4">
                             <h2 className="text-2xl font-black text-white text-center uppercase mb-6">Seus Dados</h2>
                             <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-5 bg-dark border border-white/10 rounded-[2rem] text-white font-bold" placeholder="Nome Completo" />
                             <input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-5 bg-dark border border-white/10 rounded-[2rem] text-white font-bold" placeholder="WhatsApp" />
                             <input type="tel" required value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-5 bg-dark border border-white/10 rounded-[2rem] text-white font-bold" placeholder="CPF ou CNPJ" />
                             <button type="submit" className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase shadow-xl transition-all">GERAR PIX</button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="text-center space-y-8 animate-fadeIn">
                            <div className="bg-white p-6 rounded-[2.5rem] inline-block shadow-2xl">
                                <img src={pixData.qrCodeUrl} alt="QR Code Pix" className="w-64 h-64" />
                            </div>
                            <div className="flex gap-2">
                                <input readOnly value={pixData.qrCode} className="flex-grow bg-dark border border-white/10 p-4 rounded-2xl text-[10px] text-gray-500 font-mono" />
                                <button type="button" onClick={() => { navigator.clipboard.writeText(pixData.qrCode); alert("Copiado!"); }} className="p-4 bg-green-600 text-white rounded-2xl"><DocumentDuplicateIcon className="w-6 h-6" /></button>
                            </div>
                            <p className="text-blue-400 font-black text-xs uppercase animate-pulse flex items-center justify-center gap-2"><RefreshIcon className="w-4 h-4 animate-spin" /> Aguardando pagamento...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-10 space-y-6">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto"><CheckCircleIcon className="w-12 h-12 text-green-500" /></div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">SUCESSO!</h2>
                            <button onClick={() => navigate('/alunosgreenlife/status')} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase shadow-xl">VER MEUS INGRESSOS</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GreenlifeHome;
