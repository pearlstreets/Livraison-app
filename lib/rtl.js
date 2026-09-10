import { I18nManager } from 'react-native';

// En arabe, le moteur inverse la mise en page mais pas le dessin des icônes :
// une flèche « retour » pointerait vers l'intérieur de l'écran. Le sens de
// lecture ne change qu'au redémarrage de l'app, d'où une lecture unique.
const MIRRORED = {
  'arrow-back': 'arrow-forward',
  'arrow-forward': 'arrow-back',
  'chevron-back': 'chevron-forward',
  'chevron-forward': 'chevron-back',
};

export const isRTL = I18nManager.isRTL;

export function dirIcon(name) {
  return (isRTL && MIRRORED[name]) || name;
}
