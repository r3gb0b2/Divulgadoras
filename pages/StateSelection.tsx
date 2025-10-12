import React from 'react';
import { Link } from 'react-router-dom';

const states = [
  { abbr: 'CE', name: 'Ceará' },
  { abbr: 'SE', name: 'Aracaju' },
  { abbr: 'PA', name: 'Belém' },
  { abbr: 'PI', name: 'Teresina' },
  { abbr: 'ES', name: 'Vitória' },
  { abbr: 'PB', name: 'Paraíba' },
];

const StateSelection: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Seja uma Divulgadora
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Selecione a sua localidade para iniciar o cadastro.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {states.map(state => (
            <Link
              key={state.abbr}
              to={`/register/${state.abbr}`}
              className="block p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center font-semibold text-gray-800 dark:text-gray-200 hover:bg-primary hover:text-white dark:hover:bg-primary-dark transition-all duration-300 transform hover:scale-105"
            >
              <span className="text-2xl">{state.abbr}</span>
              <span className="block text-xs mt-1">{state.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StateSelection;