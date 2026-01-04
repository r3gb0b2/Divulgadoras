
import React, { useEffect, useRef } from 'react';
import { LogoIcon, SparklesIcon, CalendarIcon, CheckCircleIcon, ClockIcon, MapPinIcon } from './Icons';
import { VipMembership } from '../types';

interface VipTicketProps {
    membership: VipMembership;
    onClose?: () => void;
    isExporting?: boolean;
}

const VipTicket: React.FC<VipTicketProps> = ({ membership, onClose, isExporting = false }) => {
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (qrRef.current && membership.benefitCode) {
            qrRef.current.innerHTML = '';
            new (window as any).QRCode(qrRef.current, {
                text: membership.benefitCode,
                width: 200,
                height: 200,
                colorDark: "#ffffff",
                colorLight: "rgba(0,0,0,0)",
                correctLevel: (window as any).QRCode.CorrectLevel.H
            });
        }
    }, [membership.benefitCode]);

    // O segredo para 1 página é ter um container com altura e largura travadas durante a exportação
    const ticketStyle = isExporting 
        ? { width: '400px', height: '700px', margin: '0' } 
        : { width: '100%', maxWidth: '380px' };

    const content = (
        <div 
            id={`ticket-content-${membership.id}`} 
            className="relative bg-[#0a0a0c] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col"
            style={ticketStyle}
        >
            {/* CABEÇALHO COM LOGO E GRADIENTE */}
            <div className="bg-gradient-to-br from-primary via-primary-dark to-[#0a0a0c] p-8 text-center relative border-b border-white/5">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                <div className="relative z-10">
                    <div className="flex justify-center mb-6">
                        <LogoIcon className="h-10 text-white brightness-125" />
                    </div>

                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 mb-4">
                        <SparklesIcon className="w-3 h-3 text-accent animate-pulse" />
                        <span className="text-[9px] font-black text-white uppercase tracking-[0.2em]">Credential VIP Official</span>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                        {membership.vipEventName}
                    </h1>
                    <p className="text-primary-light text-[10px] font-bold uppercase tracking-widest opacity-80">Equipe Certa • Acesso Exclusivo</p>
                </div>
            </div>

            {/* DIVISOR ESTILIZADO */}
            <div className="relative h-4">
                <div className="absolute left-[-20px] top-[-10px] w-10 h-10 bg-[#0a0a0c] rounded-full border border-white/10 z-20"></div>
                <div className="absolute right-[-20px] top-[-10px] w-10 h-10 bg-[#0a0a0c] rounded-full border border-white/10 z-20"></div>
                <div className="border-t-2 border-dashed border-white/10 w-full absolute top-[10px] opacity-20"></div>
            </div>

            {/* ÁREA DO QR CODE E DADOS */}
            <div className="p-8 flex-grow flex flex-col justify-between text-center">
                
                <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em]">Titular</p>
                    <h2 className="text-2xl font-black text-white uppercase truncate px-2">{membership.promoterName}</h2>
                </div>

                <div className="flex justify-center my-6">
                    <div className="p-5 bg-white/5 rounded-[2.5rem] border border-white/10 shadow-2xl relative">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-accent/30 rounded-[2.5rem] blur opacity-30"></div>
                        <div ref={qrRef} className="bg-transparent relative z-10"></div>
                        <div className="mt-4 pt-3 border-t border-white/5 relative z-10">
                            <p className="text-xs font-mono font-black text-primary tracking-[0.4em]">{membership.benefitCode}</p>
                        </div>
                    </div>
                </div>

                {/* INFO DA FESTA */}
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5 bg-white/[0.02] rounded-2xl mb-4">
                    <div className="text-center border-r border-white/5">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Horário</p>
                        <div className="flex items-center justify-center gap-1.5 text-gray-300">
                            <ClockIcon className="w-3 h-3 text-primary" />
                            <span className="text-[10px] font-black uppercase truncate">{membership.eventTime || '22h às 05h'}</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Local</p>
                        <div className="flex items-center justify-center gap-1.5 text-gray-300">
                            <MapPinIcon className="w-3 h-3 text-primary" />
                            <span className="text-[10px] font-black uppercase truncate">{membership.eventLocation || 'Ver no Site'}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="text-left">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Emissão</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Validação</p>
                        <p className="text-[10px] font-black text-green-400 uppercase tracking-tighter">CONFIRMADA ✅</p>
                    </div>
                </div>

                <div className="mt-6">
                    <p className="text-[8px] text-gray-600 uppercase font-black leading-relaxed tracking-[0.2em]">
                        Documento Oficial e Intransferível
                    </p>
                </div>
            </div>
        </div>
    );

    if (isExporting) return content;

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="w-full max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
                
                <div className="flex justify-end items-center mb-6">
                    {onClose && (
                        <button onClick={onClose} className="text-gray-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors border border-white/10 px-4 py-2 rounded-full">Fechar [X]</button>
                    )}
                </div>

                {content}

                <div className="mt-8 flex flex-col items-center gap-4">
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse text-center leading-relaxed">
                        DICA: Tire um print para acesso rápido<br/>ou use o PDF para imprimir.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default VipTicket;
