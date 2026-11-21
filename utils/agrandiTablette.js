// Tablette : toute l'app dessinee plus grosse, comme les grandes apps
// (boites, boutons, textes, user 20/11/2026). L'app est mise en page sur
// l'ecran divise par l'echelle (utils/deuxEcrans.js), puis agrandie ici :
// la vue racine, et le contenu de chaque Modal (fenetre native, hors de la
// vue racine). Telephone et pliable : echelle 1, rien ne change.
import React from 'react';
import {KeyboardAvoidingView, StyleSheet, View} from 'react-native';
import * as ReactNative from 'react-native';
import {echelleTablette} from './deuxEcrans';

// Echelle en cours, lue par le correctif clavier ci-dessous. La colonne de
// connexion (navigation/DeuxEcransStack.js, AuMilieu) l'agrandit encore.
let echelleClavier = 1;
export const fixerEchelleClavier = e => {
  echelleClavier = e;
};

// KeyboardAvoidingView compare sa place (en points de l'app) a la position
// du clavier (en points de l'ecran) : la position du clavier est ramenee en
// points de l'app, sinon le champ saisi reste sous le clavier.
const hauteurClavierOrigine =
  KeyboardAvoidingView?.prototype?._relativeKeyboardHeight;
if (hauteurClavierOrigine) {
  KeyboardAvoidingView.prototype._relativeKeyboardHeight = function (clavier) {
    if (echelleClavier === 1 || !clavier) {
      return hauteurClavierOrigine.call(this, clavier);
    }
    return hauteurClavierOrigine.call(this, {
      ...clavier,
      screenX: clavier.screenX / echelleClavier,
      screenY: clavier.screenY / echelleClavier,
      width: clavier.width / echelleClavier,
      height: clavier.height / echelleClavier,
    });
  };
}

// Contenu dessine `echelle` fois plus gros, sur toute la place recue : mis
// en page sur cette place divisee par `echelle`, puis agrandi.
export function Agrandi({echelle, children}) {
  const [place, setPlace] = React.useState(null);
  if (!echelle || echelle === 1) {
    return children;
  }
  return (
    <View
      style={styles.place}
      onLayout={e => {
        const {width, height} = e.nativeEvent.layout;
        if (
          !place ||
          Math.abs(place.width - width) > 1 ||
          Math.abs(place.height - height) > 1
        ) {
          setPlace({width, height});
        }
      }}>
      {place ? (
        <View
          style={{
            width: place.width / echelle,
            height: place.height / echelle,
            transform: [{scale: echelle}],
          }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

// Les Modal de l'app (react-native) gardent leurs proprietes ; leur contenu
// est agrandi comme le reste.
let modalesAgrandies = false;
export function agrandirLesModales() {
  const e = echelleTablette();
  if (e === 1 || modalesAgrandies) {
    return;
  }
  modalesAgrandies = true;
  echelleClavier = e;
  try {
    const ModalNative = ReactNative.Modal;
    const ModalAgrandie = React.forwardRef(function ModalAgrandie(
      {children, ...props},
      ref,
    ) {
      return (
        <ModalNative ref={ref} {...props}>
          <Agrandi echelle={e}>{children}</Agrandi>
        </ModalNative>
      );
    });
    Object.defineProperty(require('react-native'), 'Modal', {
      configurable: true,
      enumerable: true,
      get: () => ModalAgrandie,
    });
  } catch (_) {}
}

const styles = StyleSheet.create({
  place: {flex: 1, alignItems: 'center', justifyContent: 'center'},
});
