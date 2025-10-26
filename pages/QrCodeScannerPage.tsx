
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeftIcon } from '../components/Icons';
import { getPromoterById } from '../services/promoterService';
import { checkInPerson, getConfirmationByPromoterAndList } from '../services/guestListService';
import { Promoter, GuestListConfirmation } from '../types';
import { Timestamp } from 'firebase/firestore';

// --- Audio Feedback Helper ---
const playSound = (type: 'success' | 'error') => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);
    } else {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);
    }

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
};


interface ScanData {
    promoter: Promoter;
    confirmation: GuestListConfirmation;
}

const QrCodeScannerPage: React.FC = () => {
    const navigate = useNavigate();
    const [scanData, setScanData] = useState<ScanData | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const [isProcessingCheckin, setIsProcessingCheckin] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const onScanSuccess = useCallback(async (decodedText: string) => {
        // Prevent multiple rapid scans by immediately stopping the scanner
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                setIsScanning(false);
            } catch (err) {
                console.error("Falha ao parar scanner no sucesso.", err);
            }
        } else {
            // Already stopped or stopping, ignore subsequent calls from the same scan
            return;
        }

        if (navigator.vibrate) navigator.vibrate(50);
        setIsFetchingData(true);
        setScanError(null);
        setFeedbackMessage(null);
        
        try {
            const data = JSON.parse(decodedText);
            if (data.type !== 'promoter-checkin' || !data.promoterId || !data.campaignId || !data.listId) {
                throw new Error("QR Code inválido ou não reconhecido.");
            }

            const { promoterId, listId } = data;
            
            const [promoter, confirmation] = await Promise.all([
                getPromoterById(promoterId),
                getConfirmationByPromoterAndList(promoterId, listId)
            ]);

            if (!promoter) {
                throw new Error("Divulgadora não encontrada no banco de dados.");
            }
            
            if (!confirmation) {
                throw new Error("Esta divulgadora não confirmou presença na lista para este evento.");
            }

            setScanData({ promoter, confirmation });

        } catch (err: any) {
            setScanError(err.message || "Erro ao processar QR Code.");
            playSound('error');
        } finally {
            setIsFetchingData(false);
        }
    }, []);

    // Effect for scanner lifecycle management
    useEffect(() => {
        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode('qr-reader');
        }
        
        const start = async () => {
            if (scannerRef.current && !scannerRef.current.isScanning) {
                setScanError(null);
                try {
                    await scannerRef.current.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: { width: 250, height: 250 } },
                        onScanSuccess,
                        (errorMessage) => { /* ignore */ }
                    );
                    setIsScanning(true);
                } catch (err: any) {
                    setScanError(`Erro ao acessar câmera: ${err.message}.`);
                    setIsScanning(false);
                }
            }
        };

        if (!scanData) {
            start();
        }

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(err => console.error("Falha ao parar o scanner.", err));
                setIsScanning(false);
            }
        };
    }, [scanData, onScanSuccess]);

    const handleConfirmCheckin = async () => {
        if (!scanData) return;
        setIsProcessingCheckin(true);
        setScanError(null);
        setFeedbackMessage(null);
        try {
            await checkInPerson(scanData.confirmation.id, scanData.promoter.name);
            setFeedbackMessage(`${scanData.promoter.name} teve seu check-in realizado com sucesso!`);
            playSound('success');
            if (navigator.vibrate) navigator.vibrate(100);

            setScanData(prev => prev ? ({
                ...prev,
                confirmation: { ...prev.confirmation, promoterCheckedInAt: Timestamp.now() }
            }) : null);
        } catch(err: any) {
            setScanError(err.message || "Falha no check-in.");
            playSound('error');
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } finally {
            setIsProcessingCheckin(false);
        }
    };
    
    const handleScanNext = () => {
        setScanData(null);
        setScanError(null);
        setFeedbackMessage(null);
        // The useEffect will automatically restart the scanner when scanData becomes null
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Scanner de QR Code</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div id="qr-reader" className={`w-full max-w-md mx-auto rounded-lg overflow-hidden border-2 border-gray-600 ${scanData ? 'hidden' : 'block'}`}></div>
                
                {isFetchingData && <p className="text-yellow-400 text-center mt-4">Processando QR Code...</p>}

                <div className="mt-6 text-center">
                    {scanError && (
                        <div className="bg-red-900/50 text-red-300 p-4 rounded-md">
                            <p className="font-bold">Erro</p>
                            <p>{scanError}</p>
                            <button onClick={handleScanNext} className="mt-2 text-sm text-white underline">Tentar Novamente</button>
                        </div>
                    )}

                    {scanData && (
                        <div className="bg-dark/70 p-4 rounded-lg mt-6 max-w-md mx-auto">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <img 
                                    src={scanData.promoter.photoUrls?.[0] || 'https://via.placeholder.com/160/1a1a2e/e83a93?text=Foto'} 
                                    alt={scanData.promoter.name} 
                                    className="w-40 h-40 object-cover rounded-lg border-4 border-primary" 
                                />
                                <div className="text-center sm:text-left">
                                    <h3 className="text-2xl font-bold text-white">{scanData.promoter.name}</h3>
                                    <p className="text-primary">{scanData.confirmation.campaignName}</p>
                                    <p className="text-sm text-gray-500">{scanData.promoter.email}</p>
                                </div>
                            </div>
                            <div className="mt-4 border-t border-gray-700 pt-4 text-center">
                                {scanData.confirmation.promoterCheckedInAt ? (
                                    <div className="text-green-400 font-bold text-lg">Check-in já realizado!</div>
                                ) : feedbackMessage ? (
                                    <div className="text-green-400 font-bold text-lg">{feedbackMessage}</div>
                                ) : (
                                    <button onClick={handleConfirmCheckin} disabled={isProcessingCheckin} className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg text-lg hover:bg-green-700 disabled:opacity-50">
                                        {isProcessingCheckin ? 'Confirmando...' : 'Confirmar Check-in'}
                                    </button>
                                )}
                                <button onClick={handleScanNext} className="mt-4 text-sm text-primary hover:underline">Escanear Próximo</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QrCodeScannerPage;
