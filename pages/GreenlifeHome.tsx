
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
import { getActiveGreenlifeEvents, checkGreenlifeMembership } from '../services/greenlifeService';
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
        getActiveGreenlifeEvents().then(data => {
            setEvents(data);
            setIsLoading(false);
        }).catch(() => { setError("Falha ao carregar ofertas Greenlife."); setIsLoading(false); });
    }, []);

    useEffect(() => {
        if (step === 'payment' && currentCheckoutId) {
            const unsubscribe = firestore.collection('checkouts').doc(currentCheckoutId)
                .onSnapshot((doc) => {
                    if (doc.data()?.status === 'confirmed') setStep('success');
                });
            return () => unsubscribe();
        }
    }, [step, currentCheckoutId]);

    const handleCheckEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const profiles = await findPromotersByEmail(email.trim().toLowerCase());
            const membership = await checkGreenlifeMembership(email.trim().toLowerCase(), selectedEvent!.id);
            if (membership?.status === 'confirmed') { navigate('/alunosgreenlife/status'); return; }
            if (profiles.length > 0) {
                const p = profiles[0];
                setPromoter(p);
                setName(p.name);
                setWhatsapp(p.whatsapp);
            }
            setStep('confirm_data');
        } catch (err) { setError("Erro ao validar acesso."); } finally { setIsLoading(false); }
    };

    const handleProceedToPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEvent) return;
        
        setIsLoading(true);
        setError(null);
        try {
            let pId = promoter?.id;
            if (!pId) pId = await createVipPromoter({ name, email, whatsapp });
            setPromoter({ id: pId, name, email, whatsapp });
            
            const createAsaasPix = httpsCallable(functions, 'createGreenlifeAsaasPix');
            const res: any = await createAsaasPix({
                vipEventId: selectedEvent.id,
                vipEventName: selectedEvent.name,
                promoterId: pId,
                email: email.toLowerCase().trim(),
                name: name.trim(), 
                whatsapp: whatsapp.replace(/\D/g, ''), 
                taxId: taxId.replace(/\D/g, ''), 
                amount: selectedEvent.price
            });
            
            setPixData(res.data);
            setCurrentCheckoutId(res.data.checkoutId);
            setStep('payment');
        } catch (err: any) { 
            console.error(err);
            setError(err.message || "Erro ao gerar pagamento."); 
        } finally { 
            setIsLoading(false); 
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-10 px-4">
            <div className="bg-secondary/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-green-600 p-12 text-center relative">
                    <SparklesIcon className="w-16 h-16 text-white mx-auto mb-4 opacity-50" />
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter">ALUNOS <span className="text-gray-200">GREENLIFE</span></h1>
                    <p className="text-green-100 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Acesso e Benefícios Exclusivos</p>
                </div>

                <div className="p-10">
                    {error && (
                        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-200 rounded-2xl text-xs font-bold text-center flex items-center gap-3">
                            <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {step === 'select_event' && (
                        <div className="space-y-6">
                            <div className="flex justify-center mb-4">
                                <Link to="/alunosgreenlife/status" className="px-6 py-3 bg-gray-800 text-gray-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-gray-700 transition-all">Meus Ingressos</Link>
                            </div>
                            <div className="grid gap-4">
                                {events.map(ev => (
                                    <button key={ev.id} onClick={() => { setSelectedEvent(ev); setStep('identify'); }} className="bg-dark/60 p-8 rounded-[2rem] border border-white/5 flex justify-between items-center group hover:border-green-500 transition-all">
                                        <div className="text-left min-w-0 flex-grow pr-4">
                                            <p className="font-black text-xl text-white uppercase group-hover:text-green-400 transition-colors truncate">{ev.name}</p>
                                            <p className="text-[10px] text-green-500/70 font-black uppercase mt-1 truncate">
                                                {ev.attractions || 'Adesão Online'}
                                            </p>
                                        </div>
                                        <p className="text-green-500 font-black text-2xl flex-shrink-0">R$ {ev.price.toFixed(2)}</p>
                                    </button>
                                ))}
                                {events.length === 0 && !isLoading && <p className="text-center text-gray-500 py-10 font-black uppercase text-xs">Nenhuma oferta ativa.</p>}
                            </div>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleCheckEmail} className="space-y-6 text-center">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Identificação do Aluno</h2>
                            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-green-500 font-black text-center text-xl" placeholder="seu@email.com" />
                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase text-sm tracking-widest shadow-xl">{isLoading ? 'VERIFICANDO...' : 'CONTINUAR'}</button>
                        </form>
                    )}

                    {step === 'confirm_data' && (
                        <form onSubmit={handleProceedToPayment} className="space-y-4">
                             <h2 className="text-2xl font-black text-white text-center uppercase mb-6">Seus Dados</h2>
                             <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-5 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-green-500 font-bold" placeholder="Nome Completo" />
                             <input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-5 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-green-500 font-bold" placeholder="WhatsApp" />
                             <input type="tel" required value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-5 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-green-500 font-bold" placeholder="CPF/CNPJ (Para emissão do Pix)" />
                             <button type="submit" disabled={isLoading} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase text-sm tracking-widest shadow-xl">GERAR PIX</button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="text-center space-y-8 animate-fadeIn">
                            <div className="bg-white p-6 rounded-[2.5rem] inline-block shadow-2xl">
                                <img src={`data:image/png;base64,${pixData.encodedImage}`} alt="QR Code Pix" className="w-64 h-64" />
                            </div>
                            <div className="flex gap-2">
                                <input readOnly value={pixData.payload} className="flex-grow bg-dark border border-white/10 p-4 rounded-2xl text-[10px] text-gray-500 font-mono" />
                                <button onClick={() => { navigator.clipboard.writeText(pixData.payload); alert("Copiado!"); }} className="p-4 bg-green-600 text-white rounded-2xl"><DocumentDuplicateIcon className="w-6 h-6" /></button>
                            </div>
                            <p className="text-blue-400 font-black text-xs uppercase animate-pulse flex items-center justify-center gap-2"><RefreshIcon className="w-4 h-4 animate-spin" /> Aguardando confirmação do pagamento...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-10 space-y-6">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircleIcon className="w-12 h-12 text-green-500" />
                            </div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">ADESÃO CONFIRMADA!</h2>
                            <p className="text-gray-400">Seu acesso Greenlife já está liberado. Consulte seu ingresso digital.</p>
                            <button onClick={() => navigate('/alunosgreenlife/status')} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] uppercase text-sm tracking-widest">VER MEUS BENEFÍCIOS</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GreenlifeHome;
