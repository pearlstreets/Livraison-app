import React from 'react';
import CarteDemandeVue from '../components/CarteDemandeVue';

// Écran carte ouvert par le bouton carte de l'accueil : même vue que l'accueil
// quand aucune course n'est affichée (components/CarteDemandeVue.js).
export default function HeatmapScreen({ navigation }) {
  return <CarteDemandeVue navigation={navigation} onHome={() => navigation.goBack()} onList={() => navigation.goBack()} />;
}
