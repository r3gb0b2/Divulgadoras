import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeftIcon } from '../components/Icons';
import { getPromoterById } from '../services/promoterService';
import { checkInPerson, getConfirmationByPromoterAndList } from '../services/guestListService';
import { Promoter, GuestListConfirmation, Timestamp, Campaign } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllCampaigns } from '../services/settingsService';
// FIX: Import firebase to use Timestamp as a value.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

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
    const { selectedOrgId } = useAdminAuth();

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [currentCampaignId, setCurrentCampaignId] = useState<string>('');
    
    const [scanData, setScanData] = useState<ScanData | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const [isProcessingCheckin, setIsProcessingCheckin] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        if (selectedOrgId) {
            getAllCampaigns(selectedOrgId)
                .then(data => {
                    // FIX: Changed filter condition from 'c.isActive' to 'c.status === "active"' to match the Campaign type definition.
                    const activeCampaigns = data.filter(c => c.status === 'active');
                    setCampaigns(activeCampaigns);
                    if (activeCampaigns.length > 0) {
                        setCurrentCampaignId(activeCampaigns[0].id);
                    }
                })
                .catch(err => setScanError(err.message));
        }
    }, [selectedOrgId]);

    const onScanSuccess = useCallback(async (decodedText: string) => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                setIsScanning(false);
            } catch (err) {
                console.error("Falha ao parar scanner no sucesso.", err);
            }
        } else {
            return;
        }

        if (navigator.vibrate) navigator.vibrate(50);
        setIsFetchingData(true);
        setScanError(null);
        setFeedbackMessage(null);
        
        try {
            if (!currentCampaignId) {
                throw new Error("Por favor, selecione um setor de check-in antes de escanear.");
            }

            const data = JSON.parse(decodedText);
            if (data.type !== 'promoter-checkin' || !data.promoterId || !data.campaignId || !data.listId) {
                throw new Error("QR Code inválido ou não reconhecido.");
            }
            
            if (data.campaignId !== currentCampaignId) {
                const scannedCampaign = campaigns.find(c => c.id === data.campaignId);
                const scannedCampaignName = scannedCampaign ? scannedCampaign.name : "Desconhecido";
                throw new Error(`Acesso Negado. Esta credencial é para o setor: ${scannedCampaignName}.`);
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
    }, [currentCampaignId, campaigns]);

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
                    setScanError(`Erro ao acessar câmera: ${err.message}. Verifique as permissões do navegador.`);
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
                // FIX: Use firebase.firestore.Timestamp.now() as Timestamp is only a type.
                confirmation: { ...prev.confirmation, promoterCheckedInAt: firebase.firestore.Timestamp.now() }
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
                 <div className="mb-4 text-center">
                    <label htmlFor="sector-select" className="block text-sm font-medium text-gray-300">Setor de Check-in Atual</label>
                    <select
                        id="sector-select"
                        value={currentCampaignId}
                        onChange={(e) => setCurrentCampaignId(e.target.value)}
                        className="mt-1 w-full max-w-md mx-auto px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        disabled={isScanning || isFetchingData || !!scanData}
                    >
                        {campaigns.length === 0 && <option>Carregando setores...</option>}
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.stateAbbr})</option>)}
                    </select>
                </div>

                <div id="qr-reader" className={`w-full max-w-md mx-auto rounded-lg overflow-hidden border-2 border-gray-600 ${scanData ? 'hidden' : 'block'}`}></div>
                
                {isFetchingData && <p className="text-yellow-400 text-center mt-4">Processando QR Code...</p>}

                <div className="mt-6 text-center">
                    {scanError && (
                        <div className="bg-red-900/50 text-red-300 p-4 rounded-md">
                            <p className="font-bold">Erro</p>
                            <p>{scanError}</p>
                            <button onClick={handleScanNext} className="mt-2 text-sm text-white underline">Escanear Próximo</button>
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