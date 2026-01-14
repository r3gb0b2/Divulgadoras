
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
import { getActiveVipEvents } from '../services/vipService';
import { Promoter, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
  ArrowLeftIcon, CheckCircleIcon, SparklesIcon,
  UserIcon, PhoneIcon, InstagramIcon,
  AlertTriangleIcon, SearchIcon, ClockIcon, CreditCardIcon,
  RefreshIcon, DocumentDuplicateIcon, XIcon, MailIcon
} from '../components/Icons';

type CampaignStep = 'select_event' | 'benefits' | 'identify' | 'confirm_data' | 'payment' | 'success';

const ClubVipHome: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
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
        getActiveVipEvents().then(data => {
            setEvents(data);
            setIsLoading(false);
        }).catch(() => {
            setError("Falha ao carregar ofertas VIP.");
            setIsLoading(false);
        });
    }, []);

    // Monitora o Checkout único gerado
    useEffect(() => {
        if (step === 'payment' && currentCheckoutId) {
            const unsubscribe = firestore.collection('checkouts').doc(currentCheckoutId)
                .onSnapshot((doc) => {
                    const data = doc.data();
                    if (data?.status === 'confirmed') {
                        setStep('success');
                        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                    }
                });
            return () => unsubscribe();
        }
    }, [step, currentCheckoutId]);

    const handleIdentifyNext = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsEmailConfirmModalOpen(true);
    };

    const handleConfirmEmailMatch = async () => {
        if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
            alert("Os e-mails digitados não coincidem.");
            return;
        }
        setIsEmailConfirmModalOpen(false);
        await proceedToStepData();
    };

    const proceedToStepData = async () => {
        const trimmedEmail = email.trim().toLowerCase();
        setIsLoading(true);
        setError(null);
        try {
            const profiles = await findPromotersByEmail(trimmedEmail);
            if (profiles.length > 0) {
                const p = profiles[0];
                setPromoter(p);
                setName(p.name);
                setWhatsapp(p.whatsapp);
            }
            setStep('confirm_data');
        } catch (err: any) {
            setError("Erro ao validar acesso.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGeneratePix = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const sanitizedWhatsapp = whatsapp.replace(/\D/g, '');
        const sanitizedTaxId = taxId.replace(/\D/g, '');

        if (sanitizedTaxId.length !== 11 && sanitizedTaxId.length !== 14) {
            setError("CPF ou CNPJ inválido.");
            return;
        }

        setIsLoading(true);
        try {
            let pId = promoter?.id;
            if (!pId) pId = await createVipPromoter({ name, email, whatsapp: sanitizedWhatsapp });

            const finalAmount = selectedEvent!.price * quantity;
            const createAsaasPix = httpsCallable(functions, 'createVipAsaasPix');
            const res: any = await createAsaasPix({
                vipEventId: selectedEvent!.id,
                vipEventName: selectedEvent!.name,
                promoterId: pId,
                email: email.toLowerCase().trim(),
                name: name.trim(),
                whatsapp: sanitizedWhatsapp,
                taxId: sanitizedTaxId,
                amount: finalAmount,
                quantity: quantity
            });
            
            setPixData(res.data);
            setCurrentCheckoutId(res.data.checkoutId);
            setStep('payment');
        } catch (err: any) {
            setError(err.message || "Erro ao gerar cobrança Pix.");
        } finally {
            setIsLoading(false);
        }
    };

    const copyPix = () => {
        if (!pixData?.payload) return;
        navigator.clipboard.writeText(pixData.payload);
        alert("Pix Copiado!");
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => step === 'select_event' ? navigate(-1) : setStep('select_event')} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar
            </button>

            <div className="bg-secondary/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/40 p-12 text-center relative">
                    <SparklesIcon className="w-16 h-16 text-primary mx-auto mb-4 relative z-10 animate-pulse" />
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter relative z-10">CLUBE <span className="text-primary">VIP</span></h1>
                </div>

                <div className="p-10">
                    {error && <div className="mb-6 p-6 bg-red-900/20 border border-red-500/50 text-red-200 rounded-[2rem] text-xs font-bold text-center">{error}</div>}

                    {step === 'select_event' && (
                        <div className="space-y-8">
                             <div className="flex justify-center mb-6">
                                <Link to="/clubvip/status" className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-gray-400 hover:text-white">Ver meus Ingressos</Link>
                            </div>
                            <div className="grid gap-6">
                                {events.map(ev => (
                                    <button key={ev.id} onClick={() => { setSelectedEvent(ev); setStep('benefits'); }} className="bg-dark/60 p-8 rounded-[2rem] border border-white/5 flex justify-between items-center group hover:border-primary transition-all">
                                        <div className="text-left">
                                            <p className="font-black text-xl text-white uppercase group-hover:text-primary transition-colors">{ev.name}</p>
                                            <p className="text-[10px] text-gray-500 font-black uppercase mt-1">Adesão Online</p>
                                        </div>
                                        <p className="text-primary font-black text-2xl">R$ {ev.price.toFixed(2)}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'benefits' && (
                        <div className="space-y-8 animate-fadeIn">
                            <h2 className="text-3xl font-black text-white uppercase text-center">{selectedEvent?.name}</h2>
                            <div className="grid grid-cols-4 gap-3">
                                {[1, 2, 3, 4].map(num => (
                                    <button key={num} onClick={() => setQuantity(num)} className={`aspect-square rounded-2xl font-black text-2xl flex flex-col items-center justify-center transition-all border-2 ${quantity === num ? 'bg-primary border-primary text-white' : 'bg-dark/40 border-white/5 text-gray-500'}`}>
                                        {num}
                                        <span className="text-[8px] mt-1 uppercase">unid</span>
                                    </button>
                                ))}
                            </div>
                            <div className="bg-dark/40 p-8 rounded-[2.5rem] border border-white/5 text-center">
                                <p className="text-5xl font-black text-primary leading-none">R$ {(selectedEvent!.price * quantity).toFixed(2).replace('.', ',')}</p>
                            </div>
                            <button onClick={() => setStep('identify')} className="w-full py-6 bg-primary text-white font-black rounded-3xl uppercase text-sm tracking-widest shadow-xl">CONTINUAR</button>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleIdentifyNext} className="space-y-6 text-center">
                            <h2 className="text-2xl font-black text-white uppercase">Identificação</h2>
                            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-black text-center text-xl" placeholder="seu@email.com" />
                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase text-sm tracking-widest shadow-xl">{isLoading ? 'VERIFICANDO...' : 'PRÓXIMO PASSO'}</button>
                        </form>
                    )}

                    {step === 'confirm_data' && (
                        <form onSubmit={handleGeneratePix} className="space-y-5 animate-fadeIn">
                            <h2 className="text-2xl font-black text-white text-center uppercase mb-6">Confirme seus Dados</h2>
                            <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Nome Completo" />
                            <input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="WhatsApp" />
                            <input type="tel" required value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="CPF ou CNPJ" />
                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] shadow-2xl uppercase text-sm tracking-widest">GERAR QR CODE PIX</button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="text-center space-y-8 animate-fadeIn">
                            <div className="bg-white p-6 rounded-[2.5rem] inline-block shadow-2xl">
                                <img src={`data:image/png;base64,${pixData.encodedImage}`} alt="QR Code Pix" className="w-64 h-64" />
                            </div>
                            <div className="flex gap-2">
                                <input readOnly value={pixData.payload} className="flex-grow bg-dark border border-white/10 p-4 rounded-2xl text-[10px] text-gray-500 font-mono" />
                                <button onClick={copyPix} className="p-4 bg-primary text-white rounded-2xl"><DocumentDuplicateIcon className="w-6 h-6" /></button>
                            </div>
                            <p className="text-blue-400 font-black text-xs uppercase animate-pulse flex items-center justify-center gap-2"><RefreshIcon className="w-4 h-4 animate-spin" /> Aguardando confirmação...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-10 space-y-6">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto"><CheckCircleIcon className="w-12 h-12 text-green-500" /></div>
                            <h2 className="text-4xl font-black text-white uppercase">PAGO COM SUCESSO!</h2>
                            <button onClick={() => navigate('/clubvip/status')} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase text-sm tracking-widest">VER MEUS CÓDIGOS</button>
                        </div>
                    )}
                </div>
            </div>

            {isEmailConfirmModalOpen && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-6">
                    <div className="bg-secondary w-full max-w-md p-8 rounded-[2.5rem] border border-white/10 text-center space-y-6">
                        <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto text-primary"><MailIcon className="w-8 h-8" /></div>
                        <h2 className="text-2xl font-black text-white uppercase">Confirmar E-mail</h2>
                        <input type="email" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} className="w-full p-5 bg-dark border border-primary/30 rounded-2xl text-white outline-none text-center" placeholder="Redigite seu e-mail" />
                        <div className="flex gap-3">
                            <button onClick={() => setIsEmailConfirmModalOpen(false)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-xl uppercase text-xs">Voltar</button>
                            <button onClick={handleConfirmEmailMatch} className="flex-[2] py-4 bg-primary text-white font-black rounded-xl uppercase text-xs">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClubVipHome;
