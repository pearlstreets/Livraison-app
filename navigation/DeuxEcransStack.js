// Pile d'un onglet sur l'ecran deplie d'un pliable Android
// (utils/deuxEcrans.js) : deux telephones cote a cote (user 26/10/2026,
// comme AppUser).
//
// Gauche : l'ecran de navigation, soit l'ecran de l'onglet (courses, gains,
// messagerie, menu) ou une liste ouverte depuis lui (historique, versements,
// tickets...), avec la barre d'onglets dessous. Droite : la page ouverte
// depuis la gauche (detail d'une course, d'un versement, reglages...). Chaque
// cote montre la derniere page ouverte de son cote ; les autres restent
// montees, cachees et figees, comme dans une pile. Le retour ferme la
// derniere page ouverte.
//
// Meme routeur et memes noms d'ecrans que la pile native du telephone :
// navigate, push, goBack, les liens des notifications et l'etat sauve au
// pliage se comportent pareil.
//
// Pas de pile native ici : une page native posee sur une moitie retient les
// touchers de toute la fenetre (react-native-screens, mesure AppUser).
import React, {useContext, useEffect, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {
  createNavigatorFactory,
  StackRouter,
  useNavigationBuilder,
} from '@react-navigation/native';
import {BottomTabBarHeightContext} from '@react-navigation/bottom-tabs';
import {Freeze} from 'react-freeze';
import {dimensionsReelles, largeurMoitie} from '../utils/deuxEcrans';
import {aGauche, ecransVisibles, pileAvantOuverture} from '../utils/ecranPliable';

// Delai avant de figer un ecran cache : les mises a jour lancees avec la
// navigation (fermer une fenetre...) ont le temps d'etre appliquees. Sinon
// une fenetre restait ouverte, invisible, et bloquait tous les touchers
// (mesure AppUser).
const DELAI_GEL = 400;

const COULEUR_SEPARATION = '#E5E7EB';
const FOND_REPOS = '#F7F7F5';
const TEINTE_LOGO = '#C4C7CC';

// Routeur de pile, plus : une page ouverte depuis la gauche remplace celle
// de droite (utils/ecranPliable.js).
const routeurDeuxEcrans = options => {
  const routeur = StackRouter(options);
  const gauche = options.gauche || [];
  return {
    ...routeur,
    getStateForAction(state, action, config) {
      return routeur.getStateForAction(
        pileAvantOuverture(gauche, state, action),
        action,
        config,
      );
    },
  };
};

function DeuxEcransNavigator({
  id,
  initialRouteName,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
  gauche = [],
  sansBarre = [],
}) {
  const {state, descriptors, NavigationContent} = useNavigationBuilder(
    routeurDeuxEcrans,
    {
      id,
      initialRouteName,
      children,
      layout,
      screenListeners,
      screenOptions,
      screenLayout,
      UNSTABLE_router,
      gauche,
    },
  );
  // La barre d'onglets est posee sous la moitie gauche seulement (App.js).
  const hauteurBarre = useContext(BottomTabBarHeightContext) || 0;

  const largeur = dimensionsReelles()?.width || 0;
  const moitie = largeurMoitie();
  const routes = state.routes;
  const {iGauche, iDroite} = ecransVisibles(gauche, routes);
  const basGauche = sansBarre.includes(routes[iGauche]?.name)
    ? 0
    : hauteurBarre;

  return (
    <NavigationContent>
      <View style={styles.racine}>
        {iDroite === -1 ? (
          <PanneauRepos left={moitie} width={largeur - moitie} />
        ) : null}
        {routes.map((route, i) => {
          const cote = aGauche(gauche, route.name, i)
            ? {left: 0, width: moitie, bottom: basGauche}
            : {left: moitie, width: largeur - moitie, bottom: 0};
          const visible = i === iGauche || i === iDroite;
          return (
            <View
              key={route.key}
              style={[styles.cote, cote, visible ? null : styles.cache]}>
              <GelDiffere cache={!visible}>
                {descriptors[route.key].render()}
              </GelDiffere>
            </View>
          );
        })}
        <View
          pointerEvents="none"
          style={[styles.separation, {left: moitie}]}
        />
      </View>
    </NavigationContent>
  );
}

// Moitie droite quand rien n'y est ouvert : le logo de l'app, en gris.
function PanneauRepos({left, width}) {
  return (
    <View style={[styles.cote, styles.repos, {left, width, bottom: 0}]}>
      <Image
        source={require('../assets/adaptive-icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

function GelDiffere({cache, children}) {
  const [gele, setGele] = useState(false);
  useEffect(() => {
    if (!cache) {
      setGele(false);
      return undefined;
    }
    const t = setTimeout(() => setGele(true), DELAI_GEL);
    return () => clearTimeout(t);
  }, [cache]);
  return <Freeze freeze={cache && gele}>{children}</Freeze>;
}

// Ecrans d'avant l'app (connexion) : une colonne au milieu, au format du
// telephone.
export function AuMilieu({children}) {
  return (
    <View style={styles.milieu}>
      <View style={{width: largeurMoitie(), flex: 1}}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  racine: {flex: 1, backgroundColor: '#FFFFFF'},
  cote: {position: 'absolute', top: 0, overflow: 'hidden'},
  cache: {display: 'none'},
  repos: {
    backgroundColor: FOND_REPOS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {width: 320, height: 320, tintColor: TEINTE_LOGO},
  separation: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: COULEUR_SEPARATION,
  },
  milieu: {flex: 1, alignItems: 'center', backgroundColor: FOND_REPOS},
});

export const createDeuxEcransNavigator = createNavigatorFactory(
  DeuxEcransNavigator,
);
