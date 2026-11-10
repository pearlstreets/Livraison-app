/**
 * Difficulté et bonus du « Rush en ville » (page 3D : utils/jeuRush3dPage.js).
 *
 * Code ES5 en chaîne, injecté tel quel dans la page (WebView) et évalué tel
 * quel par le test utils/__tests__/jeuRush.test.mjs : une seule source.
 * Il définit l'objet global RUSH_DIFF.
 *
 * Progression continue selon la distance (niveau 0 au départ, 1 à 5000 m) :
 *  - vitesse : 11 m/s au départ, plafond 28 m/s ;
 *  - écart en temps entre deux rangées : 1,3 s au départ, 1,0 s au plus dur,
 *    jamais moins de 1,1 s après une rangée sautable (haie, voie occupée,
 *    voiture qui roule : un super saut dure 0,96 s) ;
 *  - voies occupées plus nombreuses (voitures garées, passants), voitures qui
 *    roulent vers le livreur plus fréquentes et plus rapides (dès 300 m).
 * Bonus : un toutes les 3 rangées au moins, 55 % de chance ensuite.
 * Aucun accent grave ni dollar suivi d'accolade : ce code vit dans une chaîne.
 */
export const DIFFICULTE_RUSH_JS = `
var RUSH_DIFF=(function(){
  var V_DEPART=11, V_MAX=28, GRAV=28, V_SAUT=9.6, SUPER_SAUT=1.4, DIST_MAX=5000;
  var T_DEBUT=1.3, T_FIN=1.0, T_APRES_BAS=1.1, ECART_MIN=12;
  // Bonus : durée en secondes (le casque n'a pas de durée, il absorbe un choc).
  var DUREE={turbo:5, saut:10, x2:10, aimant:10, ralenti:6, or:8};
  var IDS=['turbo','saut','x2','aimant','casque','ralenti','or'];
  function niveau(dist){ return Math.max(0,Math.min(1,(+dist||0)/DIST_MAX)); }
  // Vitesse de base (sans turbo ni ralenti).
  function vitesse(dist,palier){ return Math.min(V_MAX,V_DEPART+Math.sqrt(Math.max(0,+dist||0))*0.3+(+palier||0)*0.5); }
  // Écart en temps (s) entre deux rangées.
  function tempsEcart(dist,genrePrecedent){ var t=T_DEBUT-(T_DEBUT-T_FIN)*niveau(dist); return genrePrecedent!=='banniere'?Math.max(t,T_APRES_BAS):t; }
  // Écart en mètres : calculé sur la vitesse de base, jamais sur la vitesse du moment
  // (sinon un ralenti poserait des rangées trop serrées pour la suite).
  function ecart(dist,palier,genrePrecedent){ return Math.max(ECART_MIN,vitesse(dist,palier)*tempsEcart(dist,genrePrecedent)); }
  // Chance d'une rangée avec une voiture qui roule vers le livreur (à partir de 300 m).
  function pVoitureRoule(dist){ return dist>300?0.1+0.2*niveau(dist):0; }
  // Chance qu'une voie occupable d'une rangée reste libre (une voie l'est toujours).
  function pVoieLibre(dist){ return 0.4-0.32*niveau(dist); }
  // Vitesse d'une voiture qui roule vers le livreur (m/s), alea de 0 à 1.
  function vVoitureRoule(dist,alea){ return (4+alea*3)*(1+0.5*niveau(dist)); }
  // Obstacle d'une voie occupée, alea de 0 à 1 : voiture garée, passant adulte (mamie, papy),
  // enfant (se saute de justesse), obstacle bas (se saute), barrière de parking (glisser dessous).
  function choisirObstacle(alea){
    if(alea<0.34) return 'voiture';
    if(alea<0.64) return 'adulte';
    if(alea<0.78) return 'enfant';
    if(alea<0.9) return 'bas';
    return 'barriere';
  }
  function bonusPossible(dist,depuis,alea){ return dist>60&&depuis>=3&&alea<0.55; }
  function choisirBonus(alea){ return IDS[Math.min(IDS.length-1,Math.floor(alea*IDS.length))]; }
  function tempsEnLAir(superSaut){ return 2*V_SAUT*(superSaut?SUPER_SAUT:1)/GRAV; }
  return {V_DEPART:V_DEPART, V_MAX:V_MAX, GRAV:GRAV, V_SAUT:V_SAUT, SUPER_SAUT:SUPER_SAUT, DUREE:DUREE, IDS:IDS,
    niveau:niveau, vitesse:vitesse, tempsEcart:tempsEcart, ecart:ecart, pVoitureRoule:pVoitureRoule, pVoieLibre:pVoieLibre,
    vVoitureRoule:vVoitureRoule, choisirObstacle:choisirObstacle, bonusPossible:bonusPossible, choisirBonus:choisirBonus, tempsEnLAir:tempsEnLAir};
})();
`;
