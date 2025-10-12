import React from 'react';
import { Link } from 'react-router-dom';

const states = [
  { abbr: 'AC', name: 'Acre' }, { abbr: 'AL', name: 'Alagoas' },
  { abbr: 'AP', name: 'Amapá' }, { abbr: 'AM', name: 'Amazonas' },
  { abbr: 'BA', name: 'Bahia' }, { abbr: 'CE', name: 'Ceará' },
  { abbr: 'DF', name: 'Distrito Federal' }, { abbr: 'ES', name: 'Espírito Santo' },
  { abbr: 'GO', name: 'Goiás' }, { abbr: 'MA', name: 'Maranhão' },
  { abbr: 'MT', name: 'Mato Grosso' }, { abbr: 'MS', name: 'Mato Grosso do Sul' },
  { abbr: 'MG', name: 'Minas Gerais' }, { abbr: 'PA', name: 'Pará' },
  { abbr: 'PB', name: 'Paraíba' }, { abbr: 'PR', name: 'Paraná' },
  { abbr: 'PE', name: 'Pernambuco' }, { abbr: 'PI', name: 'Piauí' },
  { abbr: 'RJ', name: 'Rio de Janeiro' }, { abbr: 'RN', name: 'Rio Grande do Norte' },
  { abbr: 'RS', name: 'Rio Grande do Sul' }, { abbr: 'RO', name: 'Rondônia' },
  { abbr: 'RR', name: 'Roraima' }, { abbr: 'SC', name: 'Santa Catarina' },
  { abbr: 'SP', name: 'São Paulo' }, { abbr: 'SE', name: 'Sergipe' },
  { abbr: 'TO', name: 'Tocantins' }
];

const StateSelection: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Seja uma Divulgadora
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Selecione o seu estado para iniciar o cadastro.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
