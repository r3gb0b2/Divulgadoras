import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { ArrowLeftIcon } from '../components/Icons';

const QrCodeScannerPage: React.FC = () => {
    const navigate = useNavigate();
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        // Initialize the scanner
        const qrCodeScanner = new Html5Qrcode('qr-reader');
        scannerRef.current = qrCodeScanner;

        const startScanner = async () => {
            setScanError(null);
            try {
                const cameras = await Html5Qrcode.getCameras();
                if (cameras && cameras.length) {
                    setIsScanning(true);
                    qrCodeScanner.start(
                        { facingMode: "environment" }, // prefer back camera
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 }
                        },
                        (decodedText, decodedResult) => {
                            // Success callback
                            setScanResult(decodedText);
                            // Here you would typically call an API to validate the QR code
                            // For now, just display the result.
                            
                            // Optional: stop scanning after a successful scan
                            // if (scannerRef.current?.isScanning) {
                            //     scannerRef.current.stop();
                            // }
                            // setIsScanning(false);
                        },
                        (errorMessage) => {
                            // Ignore "QR code not found" errors, they are expected.
                        }
                    ).catch(err => {
                        setScanError(`Não foi possível iniciar o scanner: ${err.message}`);
                        setIsScanning(false);
                    });
                } else {
                    setScanError("Nenhuma câmera encontrada no dispositivo.");
                }
            } catch (err: any) {
                setScanError(`Erro ao acessar a câmera: ${err.message}. Por favor, conceda permissão de câmera.`);
            }
        };

        startScanner();

        // Cleanup function
        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(err => {
                    console.error("Falha ao parar o scanner de QR code.", err);
                });
            }
        };
    }, []);

    const handleClear = () => {
        setScanResult(null);
        setScanError(null);
    }

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
                <div id="qr-reader" className="w-full max-w-md mx-auto rounded-lg overflow-hidden border-2 border-gray-600"></div>

                <div className="mt-6 text-center">
                    {!isScanning && !scanError && <p className="text-yellow-400">Iniciando scanner...</p>}

                    {scanError && (
                        <div className="bg-red-900/50 text-red-300 p-4 rounded-md">
                            <p className="font-bold">Erro</p>
                            <p>{scanError}</p>
                        </div>
                    )}

                    {scanResult && (
                        <div className="bg-green-900/50 text-green-300 p-4 rounded-md mt-4">
                            <p className="font-bold">QR Code Lido com Sucesso:</p>
                            <p className="break-all">{scanResult}</p>
                            <button onClick={handleClear} className="mt-2 text-sm text-white underline">Limpar</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QrCodeScannerPage;