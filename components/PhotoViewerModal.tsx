import React, { useState, useEffect } from 'react';

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
            <div className="flex items-center justify-center gap-8">
                <button
                    onClick={goToPrevious}
                    className={`bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all ${imageUrls.length <= 1 ? 'invisible' : ''}`}
                    aria-label="Foto anterior"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                
                <button
                    onClick={onClose}
                    className="bg-black bg-opacity-50 text-white px-6 py-3 rounded-full hover:bg-opacity-75 transition-all text-lg"
                    aria-label="Fechar"
                >
                    Fechar
                </button>

                <button
                    onClick={goToNext}
                    className={`bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all ${imageUrls.length <= 1 ? 'invisible' : ''}`}
                    aria-label="Próxima foto"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
