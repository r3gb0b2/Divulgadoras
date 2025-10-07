import React, { useState, useEffect, useCallback } from 'react';

interface PhotoViewerModalProps {
  imageUrls: string[];
  startIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ imageUrls, startIndex, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex, isOpen]);

  // Fix: Hoisted function declarations and wrapped them in useCallback to prevent re-renders and fix "used before declaration" error.
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prevIndex) => {
      const isFirstSlide = prevIndex === 0;
      return isFirstSlide ? imageUrls.length - 1 : prevIndex - 1;
    });
  }, [imageUrls.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prevIndex) => {
      const isLastSlide = prevIndex === imageUrls.length - 1;
      return isLastSlide ? 0 : prevIndex + 1;
    });
  }, [imageUrls.length]);

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
  }, [isOpen, goToNext, goToPrevious, onClose]); // Updated dependencies

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
      className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-2 sm:p-4 transition-opacity duration-300"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col justify-center">
        <button
          onClick={onClose}
          className="absolute top-0 right-0 m-2 text-white text-4xl font-bold hover:text-gray-300 z-50 leading-none"
          aria-label="Fechar"
        >
          &times;
        </button>

        <div className="relative flex items-center justify-center">
          {imageUrls.length > 1 && (
             <button
                onClick={goToPrevious}
                className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 text-white p-1 sm:p-2 rounded-full hover:bg-opacity-60 transition-all z-50"
                aria-label="Foto anterior"
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
             </button>
          )}
          
          <img
            src={imageUrls[currentIndex]}
            alt={`Foto ${currentIndex + 1} de ${imageUrls.length}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />

          {imageUrls.length > 1 && (
            <button
              onClick={goToNext}
              className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 text-white p-1 sm:p-2 rounded-full hover:bg-opacity-60 transition-all z-50"
              aria-label="Próxima foto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        
        {imageUrls.length > 1 && (
            <div className="text-center text-white text-sm mt-2 font-mono">
                {currentIndex + 1} / {imageUrls.length}
            </div>
        )}
      </div>
    </div>
  );
};

export default PhotoViewerModal;
