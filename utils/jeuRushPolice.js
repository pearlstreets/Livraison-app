/**
 * Poursuite de police du « Rush en ville » (page 3D : utils/jeuRush3dPage.js).
 *
 * Code ES5 en chaîne, injecté tel quel dans la page (WebView) et évalué tel
 * quel par le test utils/__tests__/jeuRush.test.mjs : une seule source.
 * Il définit l'objet global RUSH_POLICE.
 *
 * Règles :
 *  - le livreur cogne une voiture ou un passant : il trébuche, une voiture de
 *    police arrive derrière lui et le poursuit pendant 10 s ;
 *  - 10 s sans nouveau choc : la police abandonne et repart en arrière ;
 *  - un nouveau choc pendant la poursuite : arrestation (fin de partie après
 *    une courte scène, la voiture le rattrape) ;
 *  - le casque encaisse un choc sans appeler la police, le turbo écarte
 *    l'obstacle sans choc.
 * Aucun accent grave ni dollar suivi d'accolade : ce code vit dans une chaîne.
 */
export const POLICE_RUSH_JS = `
var RUSH_POLICE=(function(){
  var DUREE=10, T_ENTREE=0.9, T_SORTIE=1.8, T_ARRESTATION=1.6;
  var ECART_SUIT=2.4, ECART_LOIN=18, ECART_ARRET=0.9;
  function creer(){ return {reste:0, t:0, sortie:0, arrete:false, arrestation:0}; }
  // Choc avec un obstacle. protege : {turbo, casque}. Rend 'turbo' | 'casque' | 'poursuite' | 'arrete'.
  function choc(p,protege){
    protege=protege||{};
    if(p.arrete) return 'arrete';
    if(protege.turbo) return 'turbo';
    if(protege.casque) return 'casque';
    if(p.reste>0){ p.arrete=true; p.reste=0; p.sortie=0; p.arrestation=0; return 'arrete'; }
    // Police en train de repartir : la nouvelle approche part de l'écart courant (pas de saut à l'écran).
    var t0=0;
    if(p.sortie>0){ var cur=ecart(p);
      if(cur<ECART_LOIN){ var k=Math.max(0,Math.min(1,(ECART_LOIN-cur)/(ECART_LOIN-ECART_SUIT))); t0=(1-Math.sqrt(1-k))*T_ENTREE; } }
    p.reste=DUREE; p.t=t0; p.sortie=0; return 'poursuite';
  }
  // Avance de dt secondes. Rend 'abandon' (une fois, fin des 10 s), 'fin' (arrestation terminée) ou ''.
  function avancer(p,dt){
    dt=Math.max(0,+dt||0);
    if(p.arrete){ p.arrestation+=dt; return p.arrestation>=T_ARRESTATION?'fin':''; }
    if(p.sortie>0) p.sortie=Math.max(0,p.sortie-dt);
    if(p.reste>0){ p.t+=dt; p.reste-=dt; if(p.reste<=0){ p.reste=0; p.sortie=T_SORTIE; return 'abandon'; } }
    return '';
  }
  function enPoursuite(p){ return !p.arrete&&p.reste>0; }
  function visible(p){ return p.arrete||p.reste>0||p.sortie>0; }
  function ratio(p){ return p.reste>0?Math.min(1,p.reste/DUREE):0; }
  function secondes(p){ return p.reste>0?Math.ceil(p.reste-1e-6):0; }
  // Distance (m) entre le livreur et la voiture de police, derrière lui ; -1 : pas de police.
  function ecart(p){
    if(p.arrete){ var a=Math.min(1,p.arrestation/0.7); return ECART_SUIT-(ECART_SUIT-ECART_ARRET)*a*(2-a); }
    if(p.reste>0){ var e=Math.min(1,p.t/T_ENTREE); return ECART_LOIN-(ECART_LOIN-ECART_SUIT)*e*(2-e); }
    if(p.sortie>0){ var s=1-p.sortie/T_SORTIE; return ECART_SUIT+s*s*40; }
    return -1;
  }
  // Photo pour la reprise de partie (seule la poursuite en cours compte).
  function photo(p){ return p.arrete?0:Math.max(0,p.reste); }
  function restaurer(reste){ var p=creer(); reste=+reste; if(isFinite(reste)&&reste>0){ p.reste=Math.min(DUREE,reste); p.t=T_ENTREE; } return p; }
  return {DUREE:DUREE, T_ARRESTATION:T_ARRESTATION, ECART_SUIT:ECART_SUIT, creer:creer, choc:choc, avancer:avancer,
    enPoursuite:enPoursuite, visible:visible, ratio:ratio, secondes:secondes, ecart:ecart, photo:photo, restaurer:restaurer};
})();
`;
