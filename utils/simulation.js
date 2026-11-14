// Course d'essai (bouton « Simuler une course » de l'écran Mini-jeux) :
// réservée au compte de démonstration remis aux vérificateurs Apple et Google
// et aux builds de développement. Aucun vrai livreur ne la voit.
const REVIEW_ACCOUNT_EMAIL = 'king@gmail.com';

export function peutSimuler(user) {
  return __DEV__ || String(user?.email || '').trim().toLowerCase() === REVIEW_ACCOUNT_EMAIL;
}
