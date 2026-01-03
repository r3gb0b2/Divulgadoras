
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
// FIX: Removed non-existent import createInitialVipMembership
import { getActiveVipEvents, checkVipMembership } from '../services/vipService';
import { Promoter, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
  ArrowLeftIcon, CheckCircleIcon, SparklesIcon,
  UserIcon, PhoneIcon, InstagramIcon,
  AlertTriangleIcon, SearchIcon, ClockIcon, CreditCardIcon,
  RefreshIcon, DocumentDuplicateIcon
} from '../components/Icons';

type CampaignStep = 'select_event' | 'benefits' | 'identify' | 'confirm_data' | 'payment' | 'success';

const ClubVipHome: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<VipEvent | null>(null);
    
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [instagram, setInstagram] = useState('');
    const [taxId, setTaxId] = useState(''); // Novo estado para CPF/CNPJ
    
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pixData, setPixData] = useState<any>(null);

    useEffect(() => {
        getActiveVipEvents().then(data => {
            setEvents(data);
            setIsLoading(false);
        }).catch(() => {
            setError("Falha ao carregar ofertas VIP.");
            setIsLoading(false);
        });
    }, []);

    // Observer para detecção automática de pagamento via Firestore
    useEffect(() => {
        if (step === 'payment' && promoter && selectedEvent) {
            const membershipId = `${promoter.id}_${selectedEvent.id}`;
            const unsubscribe = firestore.collection('vipMemberships').doc(membershipId)
                .onSnapshot((doc) => {
                    const data = doc.data();
                    if (data?.status === 'confirmed') {
                        setStep('success');
                        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                    }
                });
            return () => unsubscribe();
        }
    }, [step, promoter, selectedEvent]);

    const handleCheckEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !selectedEvent) return;

        setIsLoading(true);
        setError(null);
        try {
            const profiles = await findPromotersByEmail(trimmedEmail);
            const membership = await checkVipMembership(trimmedEmail, selectedEvent.id);
            
            if (membership?.status === 'confirmed') {
                navigate('/clubvip/status');
                return;
            }

            if (profiles.length > 0) {
                const p = profiles[0];
                setPromoter(p);
                setName(p.name);
                setWhatsapp(p.whatsapp);
                setInstagram(p.instagram);
            }
            
            setStep('confirm_data');
            setIsLoading(false);
        } catch (err: any) {
            setError("Erro ao verificar e-mail.");
            setIsLoading(false);
        }
    };

    const handleProceedToAsaas = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !whatsapp.trim() || !instagram.trim() || !taxId.trim() || !selectedEvent) return;
        
        setIsLoading(true);
        setError(null);
        try {
            let pId = promoter?.id;
            const sanitizedWhatsapp = whatsapp.replace(/\D/g, '');
            const sanitizedInstagram = instagram.replace('@', '').trim();
            const sanitizedTaxId = taxId.replace(/\D/g, '');

            if (sanitizedTaxId.length !== 11 && sanitizedTaxId.length !== 14) {
                throw new Error("CPF ou CNPJ inválido.");
            }

            if (!pId) {
                pId = await createVipPromoter({ name, email, whatsapp: sanitizedWhatsapp });
            }
            
            await firestore.collection('promoters').doc(pId).update({
                whatsapp: sanitizedWhatsapp,
                instagram: sanitizedInstagram
            });

            setPromoter({ id: pId, name, email, whatsapp: sanitizedWhatsapp, instagram: sanitizedInstagram } as any);

            const createAsaasPix = httpsCallable(functions, 'createVipAsaasPix');
            const res: any = await createAsaasPix({
                vipEventId: selectedEvent.id,
                vipEventName: selectedEvent.name,
                promoterId: pId,
                email: email.toLowerCase().trim(),
                name: name.trim(),
                whatsapp: sanitizedWhatsapp,
                taxId: sanitizedTaxId, // Enviando o documento
                amount: selectedEvent.price
            });
            
            setPixData(res.data);
            setStep('payment');
            setIsLoading(false);

        } catch (err: any) {
            setError(err.message || "Erro ao iniciar pagamento.");
            setIsLoading(false);
        }
    };

    const copyPix = () => {
        if (!pixData?.payload) return;
        navigator.clipboard.writeText(pixData.payload);
        alert("Código Pix copiado!");
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
                    {error && (
                        <div className="mb-6 p-6 bg-red-900/20 border border-red-500/50 text-red-200 rounded-[2rem] text-xs font-bold flex items-center gap-3">
                            <AlertTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0" /> 
                            <p>{error}</p>
                        </div>
                    )}

                    {step === 'select_event' && (
                        <div className="space-y-8">
                             <div className="flex flex-col sm:flex-row justify-center gap-4">
                                <Link to="/clubvip/status" className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all">
                                    <SearchIcon className="w-4 h-4" /> Consultar meu Status
                                </Link>
                            </div>
                            <div className="grid gap-6">
                                {events.map(ev => (
                                    <button 
                                        key={ev.id} 
                                        disabled={ev.isSoldOut}
                                        onClick={() => { setSelectedEvent(ev); setStep('benefits'); }} 
                                        className="bg-dark/60 p-8 rounded-[2rem] border border-white/5 hover:border-primary flex justify-between items-center group shadow-lg transition-all"
                                    >
                                        <div className="text-left">
                                            <p className="font-black text-xl text-white uppercase group-hover:text-primary transition-colors">{ev.name}</p>
                                            <p className="text-[10px] text-gray-500 font-black uppercase mt-1">Adesão Online</p>
                                        </div>
                                        <p className="text-primary font-black text-2xl">R$ {ev.price.toFixed(2).replace('.', ',')}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'benefits' && (
                        <div className="space-y-8">
                            <div className="text-center">
                                <h2 className="text-3xl font-black text-white uppercase tracking-tight">{selectedEvent?.name}</h2>
                                <p className="text-primary font-black text-sm mt-1 uppercase">Seus benefícios</p>
                            </div>
                            <div className="bg-dark/40 p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                                {selectedEvent?.benefits.map((b, i) => (
                                    <div key={i} className="flex gap-5 text-gray-200 text-lg">
                                        <CheckCircleIcon className="w-6 h-6 text-primary flex-shrink-0" /> 
                                        <span className="font-bold tracking-tight">{b}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setStep('identify')} className="w-full py-6 bg-primary text-white font-black rounded-3xl uppercase text-sm tracking-widest shadow-xl">CONTINUAR</button>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleCheckEmail} className="space-y-6 text-center animate-fadeIn">
                            <h2 className="text-2xl font-black text-white uppercase">Quem é você?</h2>
                            <p className="text-gray-400 text-sm mb-6 font-medium">Informe seu e-mail de cadastro.</p>
                            <input 
                                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-black text-center text-xl"
                                placeholder="seu@email.com"
                            />
                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase text-sm tracking-widest shadow-xl">
                                {isLoading ? 'VERIFICANDO...' : 'PRÓXIMO PASSO'}
                            </button>
                        </form>
                    )}

                    {step === 'confirm_data' && (
                        <form onSubmit={handleProceedToAsaas} className="space-y-5 animate-fadeIn">
                            <h2 className="text-2xl font-black text-white text-center uppercase mb-6">Confirme seus Dados</h2>
                            <div className="relative"><UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" /><input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Nome Completo" /></div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative"><PhoneIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" /><input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="WhatsApp" /></div>
                                <div className="relative"><InstagramIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" /><input type="text" required value={instagram} onChange={e => setInstagram(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Instagram" /></div>
                            </div>

                            <div className="relative">
                                <CreditCardIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" />
                                <input type="tel" required value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="CPF ou CNPJ do Titular" />
                                <p className="text-[10px] text-gray-500 font-bold uppercase mt-2 ml-4">Exigência do Banco Central para emissão do Pix</p>
                            </div>

                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] shadow-2xl shadow-green-900/30 uppercase text-sm tracking-widest mt-4">
                                {isLoading ? 'GERANDO PIX...' : 'GERAR QR CODE PIX'}
                            </button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="text-center space-y-8 animate-fadeIn">
                            <div className="bg-white p-6 rounded-[2.5rem] inline-block shadow-2xl">
                                <img src={`data:image/png;base64,${pixData.encodedImage}`} alt="QR Code Pix" className="w-64 h-64" />
                            </div>
                            
                            <div className="space-y-4">
                                <p className="text-white font-black uppercase text-sm tracking-widest">Código Copia e Cola</p>
                                <div className="flex gap-2">
                                    <input readOnly value={pixData.payload} className="flex-grow bg-dark border border-white/10 p-4 rounded-2xl text-[10px] text-gray-500 font-mono" />
                                    <button onClick={copyPix} className="p-4 bg-primary text-white rounded-2xl">
                                        <DocumentDuplicateIcon className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>

                            <div className="py-6 border-y border-white/5 space-y-2">
                                <p className="text-blue-400 font-black text-xs uppercase animate-pulse flex items-center justify-center gap-2">
                                    <RefreshIcon className="w-4 h-4 animate-spin" />
                                    Aguardando confirmação...
                                </p>
                                <p className="text-gray-500 text-[10px] uppercase font-bold">O sistema detecta seu pagamento em tempo real.</p>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-10 space-y-6 animate-fadeIn">
                             <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircleIcon className="w-12 h-12 text-green-500" />
                            </div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">PAGO COM SUCESSO!</h2>
                            <p className="text-gray-400">Sua adesão foi confirmada. Seus benefícios já estão sendo processados pela nossa equipe.</p>
                            <button onClick={() => navigate('/clubvip/status')} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase text-sm tracking-widest shadow-xl">VER MEUS BENEFÍCIOS</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClubVipHome;
