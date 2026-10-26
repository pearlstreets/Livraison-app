// Calculs purs des telephones pliables (aucune dependance, testes dans
// utils/__tests__/ecranPliable.test.mjs).

// En dessous, ce n'est pas un changement d'ecran (arrondis, barres systeme).
export const ECART_MIN = 40;
// Ecart tolere entre la largeur en paysage et la hauteur en portrait (barres
// systeme, encoche).
export const ECART_ROTATION = 80;

// Vrai quand la fenetre est passee sur un autre ecran (pliage, depliage).
// Rotation : largeur et hauteur s'echangent. La largeur seule ne suffit pas :
// deplie, la largeur (841) vaut presque la hauteur pliee (797), mais la
// hauteur (701) n'a rien a voir avec la largeur pliee (411) (mesure AppUser
// du 26/10/2026).
export const ecranChange = (avant, apres) => {
  const la = (avant && avant.width) || 0;
  const ha = (avant && avant.height) || 0;
  const lb = (apres && apres.width) || 0;
  const hb = (apres && apres.height) || 0;
  if (!la || !lb) {
    return false;
  }
  if (Math.abs(lb - la) < ECART_MIN) {
    return false;
  }
  const rotation =
    Math.abs(lb - ha) < ECART_ROTATION &&
    (!hb || Math.abs(hb - la) < ECART_ROTATION);
  return !rotation;
};

// Ecran de navigation (moitie gauche) : le premier ecran de la pile et ceux
// de la liste `gauche`. Les autres s'ouvrent a droite.
export const aGauche = (gauche, nom, index) =>
  index === 0 || (gauche || []).includes(nom);

// Indices des ecrans visibles : le dernier ecran de gauche, la derniere page
// ouverte a droite (-1 : aucune, panneau de repos).
export const ecransVisibles = (gauche, routes) => {
  let iGauche = 0;
  let iDroite = -1;
  (routes || []).forEach((r, i) => {
    if (aGauche(gauche, r.name, i)) {
      iGauche = i;
    } else {
      iDroite = i;
    }
  });
  return {iGauche, iDroite};
};

// Une page ouverte depuis un ecran de gauche REMPLACE les pages ouvertes a
// droite au-dessus de lui (deux telephones : toucher une autre ligne de la
// liste change la page de droite, le retour ne repasse pas par l'ancienne).
// Une page ouverte depuis la droite s'empile, comme sur le telephone.
export const pileAvantOuverture = (gauche, state, action) => {
  const type = action && action.type;
  const cible = action && action.payload && action.payload.name;
  if (
    (type !== 'NAVIGATE' && type !== 'PUSH') ||
    !cible ||
    !action.source ||
    !state.routeNames.includes(cible) ||
    aGauche(gauche, cible, -1)
  ) {
    return state;
  }
  const i = state.routes.findIndex(r => r.key === action.source);
  if (
    i === -1 ||
    i === state.routes.length - 1 ||
    !aGauche(gauche, state.routes[i].name, i)
  ) {
    return state;
  }
  return {...state, index: i, routes: state.routes.slice(0, i + 1)};
};

// Un retour lance depuis un ecran (goBack) arrive sans `target` : le
// StackRouter ignore alors sa source et retire la page du DESSUS. Deplie, la
// page du dessus peut etre une liste de gauche ouverte apres la page de
// droite : le retour de la page de droite fermait la liste. On cible la pile
// pour que le retour ferme l'ecran qui l'a demande.
export const retourDeLaSource = (state, action) => {
  const type = action && action.type;
  if (
    (type !== 'GO_BACK' && type !== 'POP') ||
    action.target !== undefined ||
    !action.source ||
    !state.routes.some(r => r.key === action.source)
  ) {
    return action;
  }
  return {...action, target: state.key};
};
