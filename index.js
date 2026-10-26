import { registerRootComponent } from 'expo';
import './services/positionLivreur'; // tâche de position déclarée au démarrage
import { avecTailleMesuree } from './utils/tailleAuDemarrage';
// App.js charge apres la mesure de l'ecran (telephones pliables, voir le
// fichier).
registerRootComponent(avecTailleMesuree(() => require('./App').default));
