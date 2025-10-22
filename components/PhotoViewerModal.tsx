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
  const [downloadableUrl, setDownloadableUrl] = useState<string | null>(null);

  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex, isOpen]);

  // Effect to generate a fresh, valid URL for the current image
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setDownloadableUrl(null); // Reset on image change

    const generateUrl = async () => {
        const originalUrl = imageUrls[currentIndex];
        if (!originalUrl) return;

        // If it's a Firebase Storage URL, it might be expired. Let's get a fresh one.
        if (originalUrl.includes('firebasestorage.googleapis.com')) {
            try {
                const urlObject = new URL(originalUrl);
                const pathName = urlObject.pathname;
                const pathStartIndex = pathName.indexOf('/o/');
                
                if (pathStartIndex !== -1) {
                    const encodedPath = pathName.substring(pathStartIndex + 3);
                    // Remove query params like token before decoding
                    const decodedPath = decodeURIComponent(encodedPath.split('?')[0]); 
                    
                    const storageRef = ref(storage, decodedPath);
                    const freshUrl = await getDownloadURL(storageRef);
                    if (isMounted) setDownloadableUrl(freshUrl);
                } else {
                     if (isMounted) setDownloadableUrl(originalUrl); // Fallback if path parsing fails
                }
            } catch (e) {
                console.warn("Could not generate a fresh download URL, falling back to the original URL.", e);
                if (isMounted) setDownloadableUrl(originalUrl); // Fallback on error
            }
        } else {
            // Not a firebase URL (e.g., blob URL), use as is.
            if (isMounted) setDownloadableUrl(originalUrl);
        }
    };

    generateUrl();

    return () => { isMounted = false; };
  }, [isOpen, currentIndex, imageUrls]);


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
                     <a
                        href={downloadableUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`bg-black bg-opacity-50 text-white px-4 py-2 rounded-full hover:bg-opacity-75 transition-all text-base flex items-center gap-2 ${!downloadableUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                        aria-label="Abrir imagem original"
                        onClick={(e) => { if (!downloadableUrl) e.preventDefault(); }}
                    >
                        <DownloadIcon className="w-5 h-5" />
                        <span>{downloadableUrl ? 'Abrir Imagem Original' : 'Carregando...'}</span>
                    </a>
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