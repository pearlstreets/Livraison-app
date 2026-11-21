import { registerRootComponent } from 'expo';
import './services/positionLivreur'; // tâche de position déclarée au démarrage
import { avecTailleMesuree } from './utils/tailleAuDemarrage';
import { agrandirSurTablette } from './utils/agrandirTablette';
// App.js charge apres la mesure de l'ecran (telephones pliables, voir le
// fichier).
registerRootComponent(
  avecTailleMesuree(() => {
    // Avant App.js : ses feuilles de style passent deja par l'agrandissement.
    agrandirSurTablette();
    return require('./App').default;
  }),
);
