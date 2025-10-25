import React, { useState, useEffect } from 'react';

interface PhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrls: string[];
  startIndex?: number;
}

const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ isOpen, onClose, imageUrls, startIndex = 0 }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(startIndex);
      setIsLoading(true);
    }
  }, [isOpen, startIndex]);
  
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
  }, [isOpen, currentIndex, imageUrls.length]);


  if (!isOpen) {
    return null;
  }

  const goToPrevious = () => {
    setIsLoading(true);
    const isFirst = currentIndex === 0;
    const newIndex = isFirst ? imageUrls.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const goToNext = () => {
    setIsLoading(true);
    const isLast = currentIndex === imageUrls.length - 1;
    const newIndex = isLast ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };

  const currentImage = imageUrls[currentIndex];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-4xl font-bold hover:text-gray-300 z-50"
        >
          &times;
        </button>

        <div className="relative">
            {isLoading && (
                 <div className="w-[80vw] h-[80vh] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white"></div>
                 </div>
            )}
            <img
                src={currentImage}
                alt={`Foto ${currentIndex + 1}`}
                className={`max-w-[85vw] max-h-[85vh] object-contain rounded-lg shadow-2xl ${isLoading ? 'hidden' : 'block'}`}
                onLoad={() => setIsLoading(false)}
                onError={() => setIsLoading(false)} // handle image load error
            />
        </div>

        {imageUrls.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute top-1/2 -translate-y-1/2 -left-12 text-white text-5xl font-bold hover:text-gray-300"
            >
              &#8249;
            </button>
            <button
              onClick={goToNext}
              className="absolute top-1/2 -translate-y-1/2 -right-12 text-white text-5xl font-bold hover:text-gray-300"
            >
              &#8250;
            </button>
          </>
        )}
        <div className="text-center text-white mt-2">
            {currentIndex + 1} / {imageUrls.length}
        </div>
      </div>
    </div>
  );
};

export default PhotoViewerModal;
