import React from 'react';
import { Link } from 'react-router-dom';

// FIX: Added placeholder content to make this file a valid module.
const PagSeguroSettingsPage: React.FC = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Configurações PagSeguro</h1>
        <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
          &larr; Voltar ao Dashboard
        </Link>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400">
          Página de configurações do PagSeguro em construção.
        </p>
      </div>
    </div>
  );
};

export default PagSeguroSettingsPage;
