export const states = [
  { abbr: 'CE', name: 'Ceará' },
  { abbr: 'SE', name: 'Aracaju' }, // Note: SE is Sergipe, Aracaju is the capital. Keeping as is from original file.
  { abbr: 'PA', name: 'Belém' }, // Note: PA is Pará, Belém is the capital.
  { abbr: 'PI', name: 'Teresina' }, // Note: PI is Piauí, Teresina is the capital.
  { abbr: 'ES', name: 'Vitória' }, // Note: ES is Espírito Santo, Vitória is the capital.
  { abbr: 'PB', name: 'Paraíba' },
];

export const stateMap: { [key: string]: string } = {
  CE: 'Ceará',
  SE: 'Sergipe',
  PA: 'Pará',
  PI: 'Piauí',
  ES: 'Espírito Santo',
  PB: 'Paraíba'
};
