import React, { useState, useEffect } from 'react';
import { DownloadIcon } from './Icons';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

interface PhotoViewerModalProps {
  imageUrls: string[];
  startIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ imageUrls, startIndex, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex, isOpen]);

  const goToPrevious = () => {
    if (imageUrls.length <= 1) return;
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? imageUrls.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const goToNext = () => {
    if (imageUrls.length <= 1) return;
    const isLastSlide = currentIndex === imageUrls.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };
  
  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
        const originalUrl = imageUrls[currentIndex];
        let freshUrl = originalUrl;

        // If it's a Firebase Storage URL, it might be expired. Let's get a fresh one.
        if (originalUrl.includes('firebasestorage.googleapis.com')) {
            try {
                // Extract the storage path from the full URL
                const urlObject = new URL(originalUrl);
                const pathName = urlObject.pathname;
                
                const pathStartIndex = pathName.indexOf('/o/');
                if (pathStartIndex !== -1) {
                    const encodedPath = pathName.substring(pathStartIndex + 3);
                    const decodedPath = decodeURIComponent(encodedPath);

                    // Get a fresh, valid download URL for this path
                    const storageRef = ref(storage, decodedPath);
                    freshUrl = await getDownloadURL(storageRef);
                }
            } catch (e) {
                console.warn("Could not generate a fresh download URL, falling back to the original URL.", e);
            }
        }
        
        // Fetch the image data using the (potentially fresh) URL
        const response = await fetch(freshUrl);
        if (!response.ok) {
            throw new Error(`Não foi possível buscar a imagem. Status: ${response.status}`);
        }
        const blob = await response.blob();
        
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        
        // Suggest a filename from the original URL (without token)
        const filename = originalUrl.split('/').pop()?.split('?')[0] || 'divulgadora.jpg';
        link.download = decodeURIComponent(filename);

        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);

    } catch (error) {
        console.error("Download failed:", error);
        setDownloadError("Falha no download. O link pode ter expirado ou ser inválido.");
        setTimeout(() => setDownloadError(null), 3000);
    } finally {
        setIsDownloading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentIndex]); // Re-add listener if state changes

  if (!isOpen || !imageUrls || imageUrls.length === 0) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 transition-opacity duration-300"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col justify-center">
        {/* Close button moved to the bottom controls */}

        <div className="flex-grow flex items-center justify-center min-h-0">
          <img
            src={imageUrls[currentIndex]}
            alt={`Foto ${currentIndex + 1} de ${imageUrls.length}`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        </div>
        
        {/* Controls container */}
        <div className="flex-shrink-0 flex flex-col items-center w-full mt-4">
            <div className="flex items-center justify-center gap-4 sm:gap-8">
                <button
                    onClick={goToPrevious}
                    className={`bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all ${imageUrls.length <= 1 ? 'invisible' : ''}`}
                    aria-label="Foto anterior"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="bg-black bg-opacity-50 text-white px-4 py-2 rounded-full hover:bg-opacity-75 transition-all text-base flex items-center gap-2 disabled:opacity-50"
                        aria-label="Baixar Imagem"
                    >
                        <DownloadIcon className="w-5 h-5" />
                        <span>{isDownloading ? 'Baixando...' : 'Baixar Imagem'}</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="bg-black bg-opacity-50 text-white px-5 py-2 rounded-full hover:bg-opacity-75 transition-all text-base"
                        aria-label="Fechar"
                    >
                        Fechar
                    </button>
                </div>

                <button
                    onClick={goToNext}
                    className={`bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all ${imageUrls.length <= 1 ? 'invisible' : ''}`}
                    aria-label="Próxima foto"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {downloadError && <p className="text-xs text-red-400 mt-2">{downloadError}</p>}

            {imageUrls.length > 1 && (
                <div className="text-center text-white text-sm font-mono mt-2">
                    {currentIndex + 1} / {imageUrls.length}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PhotoViewerModal;