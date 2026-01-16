
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
import { getActiveVipEvents, getVipCodeStats } from '../services/vipService';
import { Promoter, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
  ArrowLeftIcon, CheckCircleIcon, SparklesIcon,
  UserIcon, PhoneIcon, InstagramIcon,
  AlertTriangleIcon, SearchIcon, ClockIcon, RefreshIcon, 
  DocumentDuplicateIcon, XIcon, MailIcon
} from '../components/Icons';

type CampaignStep = 'select_event' | 'benefits' | 'identify' | 'confirm_data' | 'payment' | 'success';

const ClubVipHome: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [selectedEvent, setSelectedEvent] = useState<VipEvent | null>(null);
    const [email, setEmail] = useState('');
    const [confirmEmail, setConfirmEmail] = useState('');
    const [isEmailConfirmModalOpen, setIsEmailConfirmModalOpen] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [taxId, setTaxId] = useState(''); 
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pixData, setPixData] = useState<any>(null);
    const [currentCheckoutId, setCurrentCheckoutId] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getActiveVipEvents();
                setEvents(data);
                const stocks: Record<string, number> = {};
                for (const ev of data) {
                    stocks[ev.id] = await getVipCodeStats(ev.id);
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

    const handleIdentifyNext = (e: React.FormEvent) => { e.preventDefault(); setIsEmailConfirmModalOpen(true); };

    const handleConfirmEmailMatch = async () => {
        if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) { alert("E-mails não coincidem."); return; }
        setIsEmailConfirmModalOpen(false);
        setIsLoading(true);
        try {
            const profiles = await findPromotersByEmail(email.trim().toLowerCase());
            if (profiles.length > 0) {
                const p = profiles[0];
                setPromoter(p);
                setName(p.name);
                setWhatsapp(p.whatsapp);
            }
            setStep('confirm_data');
        } finally { setIsLoading(false); }
    };

    const handleGeneratePix = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            let pId = promoter?.id;
            if (!pId) pId = await createVipPromoter({ name, email, whatsapp });
            const createPagarMePix = httpsCallable(functions, 'createVipPagarMePix');
            const res: any = await createPagarMePix({
                vipEventId: selectedEvent!.id,
                promoterId: pId,
                email: email.toLowerCase().trim(),
                name, whatsapp, taxId,
                amount: selectedEvent!.price * quantity,
                quantity
            });
            setPixData(res.data);
            setCurrentCheckoutId(res.data.checkoutId);
            setStep('payment');
        } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => step === 'select_event' ? navigate(-1) : setStep('select_event')} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase transition-all">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar
            </button>

            <div className="bg-secondary rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-dark/40 p-12 text-center border-b border-white/5">
                    <SparklesIcon className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter">CLUBE <span className="text-primary">VIP</span></h1>
                </div>

                <div className="p-10">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4">
                            <RefreshIcon className="w-10 h-10 text-primary animate-spin" />
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Buscando Ofertas...</p>
                        </div>
                    ) : step === 'select_event' && (
                        <div className="space-y-6">
                            <div className="flex justify-center mb-6">
                                <Link to="/clubvip/status" className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all">Meus Ingressos</Link>
                            </div>
                            <div className="grid gap-4">
                                {events.map(ev => {
                                    const stock = stockMap[ev.id] ?? 0;
                                    const isSoldOut = stock === 0 || ev.saleStatus === 'sold_out';
                                    const isLowStock = !isSoldOut && ev.saleStatus === 'low_stock';

                                    return (
                                        <button key={ev.id} onClick={() => { if(!isSoldOut) { setSelectedEvent(ev); setStep('benefits'); } }} disabled={isSoldOut} className={`p-8 rounded-[2rem] border flex justify-between items-center transition-all ${isSoldOut ? 'bg-gray-800/10 border-white/5 cursor-not-allowed opacity-50' : 'bg-dark/60 border-white/5 hover:border-primary shadow-xl'}`}>
                                            <div className="text-left flex-grow pr-4">
                                                <p className={`font-black text-xl uppercase ${isSoldOut ? 'text-gray-500' : 'text-white'}`}>{ev.name}</p>
                                                <p className="text-[10px] text-gray-500 font-black uppercase mt-1">Adesão Digital</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {isSoldOut ? (
                                                    <>
                                                        <span className="text-[26px] text-gray-500 font-black line-through leading-none">R$ {ev.price.toFixed(2).replace('.', ',')}</span>
                                                        <span className="px-5 py-2 bg-red-600 text-white text-[11px] font-black uppercase rounded-2xl">ESGOTADO</span>
                                                    </>
                                                ) : isLowStock ? (
                                                    <>
                                                        <p className="text-primary font-black text-2xl leading-none">R$ {ev.price.toFixed(2)}</p>
                                                        <span className="px-5 py-2 bg-yellow-600 text-white text-[11px] font-black uppercase rounded-2xl animate-soft-flash">ESGOTANDO</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-primary font-black text-2xl leading-none">R$ {ev.price.toFixed(2)}</p>
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

                    {step === 'benefits' && (
                        <div className="space-y-8">
                            <h2 className="text-3xl font-black text-white uppercase text-center">{selectedEvent?.name}</h2>
                            <div className="grid grid-cols-4 gap-3">
                                {[1, 2, 3, 4].map(num => (
                                    <button key={num} onClick={() => setQuantity(num)} className={`aspect-square rounded-2xl font-black text-2xl flex flex-col items-center justify-center transition-all border-2 ${quantity === num ? 'bg-primary border-primary text-white' : 'bg-dark/40 border-white/5 text-gray-500'}`}>
                                        {num}<span className="text-[8px] uppercase">unid</span>
                                    </button>
                                ))}
                            </div>
                            <div className="bg-dark/40 p-8 rounded-[2.5rem] text-center border border-white/5">
                                <p className="text-5xl font-black text-primary">R$ {(selectedEvent!.price * quantity).toFixed(2).replace('.', ',')}</p>
                            </div>
                            <button onClick={() => setStep('identify')} className="w-full py-6 bg-primary text-white font-black rounded-3xl uppercase tracking-widest transition-all">CONTINUAR</button>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleIdentifyNext} className="space-y-6 text-center">
                            <h2 className="text-2xl font-black text-white uppercase">Identificação</h2>
                            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white text-center text-xl font-black outline-none focus:ring-2 focus:ring-primary" placeholder="seu@email.com" />
                            <button type="submit" className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase shadow-xl transition-all">PRÓXIMO</button>
                        </form>
                    )}

                    {step === 'confirm_data' && (
                        <form onSubmit={handleGeneratePix} className="space-y-5">
                            <h2 className="text-2xl font-black text-white text-center uppercase mb-6">Confirme seus Dados</h2>
                            <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white font-bold" placeholder="Nome Completo" />
                            <input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white font-bold" placeholder="WhatsApp" />
                            <input type="tel" required value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white font-bold" placeholder="CPF ou CNPJ" />
                            <button type="submit" className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase shadow-xl transition-all">GERAR PIX</button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="text-center space-y-8 animate-fadeIn">
                            <div className="bg-white p-6 rounded-[2.5rem] inline-block shadow-2xl">
                                <img src={pixData.qrCodeUrl} alt="QR Code" className="w-64 h-64" />
                            </div>
                            <div className="flex gap-2">
                                <input readOnly value={pixData.qrCode} className="flex-grow bg-dark border border-white/10 p-4 rounded-2xl text-[10px] text-gray-500 font-mono" />
                                <button type="button" onClick={() => { navigator.clipboard.writeText(pixData.qrCode); alert("Copiado!"); }} className="p-4 bg-primary text-white rounded-2xl"><DocumentDuplicateIcon className="w-5 h-5" /></button>
                            </div>
                            <p className="text-blue-400 font-black text-xs uppercase animate-pulse flex items-center justify-center gap-2"><RefreshIcon className="w-4 h-4 animate-spin" /> Aguardando confirmação...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-10 space-y-6">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto"><CheckCircleIcon className="w-12 h-12 text-green-500" /></div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">PAGO COM SUCESSO!</h2>
                            <button onClick={() => navigate('/clubvip/status')} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase shadow-xl">VER MEUS CÓDIGOS</button>
                        </div>
                    )}
                </div>
            </div>

            {isEmailConfirmModalOpen && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-6">
                    <div className="bg-secondary w-full max-w-md p-8 rounded-[2.5rem] border border-white/10 text-center space-y-6">
                        <h2 className="text-2xl font-black text-white uppercase">Confirmar E-mail</h2>
                        <input type="email" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} className="w-full p-5 bg-dark border border-primary/30 rounded-2xl text-white outline-none text-center" placeholder="Redigite o e-mail" />
                        <div className="flex gap-3">
                            <button onClick={() => setIsEmailConfirmModalOpen(false)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-xl uppercase">Voltar</button>
                            <button onClick={handleConfirmEmailMatch} className="flex-[2] py-4 bg-primary text-white font-black rounded-xl uppercase">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClubVipHome;
