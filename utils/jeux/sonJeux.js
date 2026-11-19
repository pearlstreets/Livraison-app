/**
 * Son des mini-jeux clients (Slalom, Pile, Tournée) : réglages et moteur.
 *
 * Aucun module natif et aucun fichier audio : le son est synthétisé en Web Audio
 * dans une WebView cachée (components/jeux/SonJeux.js). MOTEUR_AUDIO_JS est du
 * JavaScript de page web.
 *
 * Réglages (interrupteurs « Musique » et « Bruitages ») gardés sur le téléphone
 * dans AsyncStorage (`jeux_son_v1`, clé du livreur) :
 *   chargerReglagesSon()  : Promise des réglages {musique, bruitages}
 *   reglagesSon()         : réglages courants (synchrone)
 *   changerReglageSon(cle, valeur) : cle = 'musique' | 'bruitages'
 *   ecouterReglagesSon(f) : abonnement, rend la fonction de désabonnement
 *
 * Moteur : window.sonJeu = { reglages(r), musique(jeu | null), jouer(nom), reveil(), veille() }
 *   Sans musique, le contexte audio se met en veille après 8 s de silence (veille() : tout de suite).
 *   Musiques : 'slalom' (course, 152 bpm, la mineur, lead arpégé en dents de scie),
 *   'pile' (marimba doux, 108 bpm, fa majeur), 'tournee' (funky, 124 bpm, ré dorien),
 *   'basket' (hip-hop, 96 bpm, do mineur), 'sommet' (fa majeur, 104 bpm),
 *   'memoire' (boîte à musique, 96 bpm). `basse` (32 pas) remplace racines + motif.
 *   Bruitages : saut, accroupi, ramasse, booster, choc, record, tranche, couteau
 *   (lame de Fruits express, WAV de utils/jeux/sonCouteau.js), carte,
 *   vie, sirene, sifflet, niveau, perdu.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SON_COUTEAU_WAV_BASE64} from './sonCouteau';

// Livreur : même clé que les anciens réglages du livreur (utils/sonJeux.js).
const CLE = 'jeux_son_v1';
let reglages = {musique: true, bruitages: true};
let charge = false;
let chargement = null;
const abonnes = new Set();

export function chargerReglagesSon() {
  if (charge) return Promise.resolve(reglages);
  if (!chargement) {
    chargement = AsyncStorage.getItem(CLE)
      .then(brut => {
        if (brut && !charge) {
          const r = JSON.parse(brut);
          reglages = {musique: r?.musique !== false, bruitages: r?.bruitages !== false};
        }
      })
      .catch(() => {})
      .then(() => {
        charge = true;
        abonnes.forEach(f => {
          try {
            f(reglages);
          } catch (e) {
            // Abonné défaillant : ignoré.
          }
        });
        return reglages;
      });
  }
  return chargement;
}

export function reglagesSon() {
  return reglages;
}

export function changerReglageSon(cle, valeur) {
  if (cle !== 'musique' && cle !== 'bruitages') return;
  reglages = {...reglages, [cle]: !!valeur};
  charge = true;
  AsyncStorage.setItem(CLE, JSON.stringify(reglages)).catch(() => {});
  abonnes.forEach(f => {
    try {
      f(reglages);
    } catch (e) {
      // Abonné défaillant : ignoré.
    }
  });
}

export function ecouterReglagesSon(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export const MOTEUR_AUDIO_JS = `
(function(){
  var ctx=null, maitre=null, busMus=null, busFx=null, bufBruit=null, bufCouteau=null;
  var etat={musique:true,bruitages:true,jeu:null};
  var minuteur=null, prochain=0, pas=0, piste=null, genre=0, dodo=null;

  function init(){
    if(ctx) return true;
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
    try{ ctx=new AC(); }catch(e){ return false; }
    maitre=ctx.createGain(); maitre.gain.value=0.9; maitre.connect(ctx.destination);
    busMus=ctx.createGain(); busMus.gain.value=0.2; busMus.connect(maitre);
    busFx=ctx.createGain(); busFx.gain.value=0.5; busFx.connect(maitre);
    var n=ctx.sampleRate; bufBruit=ctx.createBuffer(1,n,ctx.sampleRate);
    var c=bufBruit.getChannelData(0); for(var i=0;i<n;i++) c[i]=Math.random()*2-1;
    chargerCouteau();
    return true;
  }
  // Son de couteau (Fruits express) : WAV embarqué en base64, décodé une fois.
  function chargerCouteau(){
    try{
      var b=atob('${SON_COUTEAU_WAV_BASE64}'), o=new Uint8Array(b.length);
      for(var i=0;i<b.length;i++) o[i]=b.charCodeAt(i);
      var p=ctx.decodeAudioData(o.buffer,function(x){ bufCouteau=x; },function(){});
      if(p&&p.catch) p.catch(function(){});
    }catch(e){}
  }
  function couteau(t){
    if(!bufCouteau) return;
    var s=ctx.createBufferSource(), g=ctx.createGain();
    s.buffer=bufCouteau; g.gain.value=0.45; // même niveau que les autres bruitages
    s.connect(g); g.connect(busFx); s.start(t);
  }
  function reveil(){ if(ctx&&ctx.state==='suspended'){ try{ctx.resume();}catch(e){} } }
  // Sans musique, le contexte audio est mis en veille après un silence (batterie) ;
  // reveil() le relance au prochain son.
  function endormir(delai){
    if(dodo) clearTimeout(dodo);
    dodo=setTimeout(function(){ dodo=null; if(!minuteur&&ctx&&ctx.state==='running'){ try{ctx.suspend();}catch(e){} } },delai);
  }
  function hz(m){ return 440*Math.pow(2,(m-69)/12); }

  function note(bus,f,t,d,type,vol,glisse,coupe){
    var o=ctx.createOscillator(), g=ctx.createGain(), sortie=g;
    o.type=type||'square'; o.frequency.setValueAtTime(f,t);
    if(glisse) o.frequency.exponentialRampToValueAtTime(glisse,t+d);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol||0.3,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    if(coupe){
      var fl=ctx.createBiquadFilter(); fl.type='lowpass'; fl.frequency.setValueAtTime(coupe,t);
      fl.frequency.exponentialRampToValueAtTime(Math.max(120,coupe*0.2),t+d);
      o.connect(fl); fl.connect(g);
    } else { o.connect(g); }
    sortie.connect(bus); o.start(t); o.stop(t+d+0.03);
  }
  function souffle(bus,t,d,vol,type,freq,q){
    var s=ctx.createBufferSource(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    s.buffer=bufBruit; s.loop=true; f.type=type||'lowpass'; f.frequency.value=freq||1000; f.Q.value=q||0.7;
    g.gain.setValueAtTime(vol||0.3,t); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t+d+0.03);
  }
  function grosseCaisse(bus,t,vol){ note(bus,150,t,0.16,'sine',vol,45); }
  function caisseClaire(bus,t,vol){ souffle(bus,t,0.13,vol,'bandpass',1800,0.8); note(bus,190,t,0.08,'triangle',vol*0.6,120); }
  function charley(bus,t,vol,long){ souffle(bus,t,long?0.12:0.04,vol,'highpass',7000,0.7); }

  // Une musique par jeu. Grille de croches, 4 mesures de 8 croches (32 pas).
  var PISTES={
    slalom:{ bpm:152, swing:0,
      lead:[69,72,76,72,69,72,76,81, 65,69,72,69,65,69,72,77, 67,72,76,72,67,72,76,79, 67,71,74,71,67,71,74,79],
      typeLead:'sawtooth', volLead:0.13, dLead:0.9, coupeLead:3800,
      mel:[81,0,0,84, 83,0,81,0, 77,0,0,81, 79,0,77,0, 79,0,0,83, 84,0,83,0, 79,0,74,0, 83,0,86,0],
      typeMel:'triangle', volMel:0.22,
      bassRacines:[45,41,48,43], bassMotif:[0,12,0,12,0,12,7,12], typeBasse:'square', volBasse:0.2, dBasse:0.9, coupeBasse:900,
      grosseCaisse:[1,0,0,0,1,0,0,0], caisseClaire:[0,0,1,0,0,0,1,0], charley:[0,1,0,1,0,1,0,1], accents:[0,0,0,0,0,0,0,1] },
    pile:{ bpm:108, swing:0.1,
      lead:[84,0,81,77,81,0,77,0, 81,0,77,74,77,0,74,0, 82,0,77,74,77,0,74,70, 79,0,76,72,76,79,84,0],
      typeLead:'sine', volLead:0.34, dLead:0.8, coupeLead:0,
      mel:[89,0,0,0,0,0,0,0, 86,0,0,0,0,0,0,0, 89,0,0,0,86,0,0,0, 88,0,0,0,91,0,0,0],
      typeMel:'triangle', volMel:0.1,
      bassRacines:[41,38,46,48], bassMotif:[0,0,7,0,0,0,7,0], typeBasse:'triangle', volBasse:0.38, dBasse:0.7, coupeBasse:0,
      grosseCaisse:[1,0,0,0,1,0,0,0], caisseClaire:[0,0,0,0,0,0,0,0], charley:[1,0,1,0,1,0,1,0], accents:[0,0,0,0,0,0,0,0] },
    tournee:{ bpm:124, swing:0.16,
      lead:[74,77,81,0,79,77,74,0, 71,74,79,0,77,74,71,0, 74,77,81,0,84,81,77,0, 72,76,79,0,76,72,67,0],
      typeLead:'square', volLead:0.15, dLead:0.45, coupeLead:2600,
      mel:[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
      typeMel:'triangle', volMel:0,
      bassRacines:[38,43,38,36], bassMotif:[0,0,12,0,7,0,12,10], typeBasse:'sawtooth', volBasse:0.2, dBasse:0.8, coupeBasse:700,
      grosseCaisse:[1,0,0,1,1,0,0,0], caisseClaire:[0,0,1,0,0,0,1,0], charley:[1,1,1,1,1,1,1,1], accents:[0,0,0,0,0,0,0,0] },
    basket:{ bpm:96, swing:0.18,
      lead:[72,0,75,0,79,0,75,77, 0,0,74,0,77,0,72,0, 72,0,75,0,79,0,82,79, 0,0,77,0,75,0,74,0],
      typeLead:'triangle', volLead:0.2, dLead:0.7, coupeLead:0,
      mel:[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
      typeMel:'triangle', volMel:0,
      bassRacines:[36,44,41,43], bassMotif:[0,0,0,12,0,0,7,0], typeBasse:'sawtooth', volBasse:0.2, dBasse:0.9, coupeBasse:600,
      grosseCaisse:[1,0,0,1,0,0,1,0], caisseClaire:[0,0,1,0,0,0,1,0], charley:[1,1,1,1,1,1,1,1], accents:[0,0,0,0,0,0,0,1] },
    // Sommet : montée régulière en fa majeur, pas de marche.
    sommet:{ bpm:104, swing:0,
      lead:[65,0,69,0,72,0,77,0, 67,0,70,0,74,0,79,0, 69,0,72,0,77,0,81,0, 72,0,77,0,81,0,84,0],
      typeLead:'triangle', volLead:0.3, dLead:0.8, coupeLead:0,
      mel:[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
      typeMel:'triangle', volMel:0,
      basse:[41,0,41,0,48,0,48,0, 43,0,43,0,50,0,50,0, 45,0,45,0,52,0,52,0, 41,0,41,0,48,0,53,0],
      bassRacines:[41,43,45,41], bassMotif:[0,0,0,0,0,0,0,0], typeBasse:'square', volBasse:0.1, dBasse:0.8, coupeBasse:0,
      grosseCaisse:[1,0,0,0,0,0,0,0], caisseClaire:[0,0,0,0,1,0,0,0], charley:[0,0,0,0,0,0,1,1], accents:[0,0,0,0,0,0,0,0] },
    // Mémoire : boîte à musique, douce et rêveuse.
    memoire:{ bpm:96, swing:0,
      lead:[76,0,79,0,83,0,79,0, 77,0,81,0,84,0,81,0, 79,0,83,0,86,0,83,0, 81,0,79,0,76,0,0,0],
      typeLead:'sine', volLead:0.3, dLead:0.9, coupeLead:0,
      mel:[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
      typeMel:'triangle', volMel:0,
      basse:[52,0,0,0,0,0,0,0, 53,0,0,0,0,0,0,0, 55,0,0,0,0,0,0,0, 57,0,0,0,55,0,0,0],
      bassRacines:[52,53,55,57], bassMotif:[0,0,0,0,0,0,0,0], typeBasse:'sine', volBasse:0.34, dBasse:1.6, coupeBasse:0,
      grosseCaisse:[0,0,0,0,0,0,0,0], caisseClaire:[0,0,0,0,0,0,0,0], charley:[0,0,0,0,1,0,0,0], accents:[0,0,0,0,0,0,0,0] }
  };

  function planifier(){
    if(!piste||!ctx) return;
    var croche=60/piste.bpm/2;
    while(prochain<ctx.currentTime+0.3){
      var i=pas%32, mesure=Math.floor(i/8), p=i%8;
      var t=prochain+((p%2===1)?croche*piste.swing:0);
      var n=piste.lead[i];
      if(n) note(busMus,hz(n),t,croche*piste.dLead,piste.typeLead,piste.volLead,0,piste.coupeLead);
      var m=piste.mel[i];
      if(m&&piste.volMel) note(busMus,hz(m),t,croche*1.7,piste.typeMel,piste.volMel);
      var d=piste.bassMotif[p];
      if(piste.basse){ if(piste.basse[i]) note(busMus,hz(piste.basse[i]),t,croche*piste.dBasse,piste.typeBasse,piste.volBasse,0,piste.coupeBasse); }
      else if(!(piste===PISTES.pile&&p%2===1)) note(busMus,hz(piste.bassRacines[mesure]+d),t,croche*piste.dBasse,piste.typeBasse,piste.volBasse,0,piste.coupeBasse);
      if(piste.grosseCaisse[p]) grosseCaisse(busMus,t,piste===PISTES.pile?0.28:0.5);
      if(piste.caisseClaire[p]) caisseClaire(busMus,t,0.22);
      if(piste.charley[p]) charley(busMus,t,piste===PISTES.pile?0.06:0.1,piste.accents[p]);
      prochain+=croche; pas++;
    }
  }
  function demarrer(){
    if(!etat.musique||!etat.jeu||!PISTES[etat.jeu]||!init()) return;
    if(minuteur&&piste===PISTES[etat.jeu]) return;
    arreter();
    reveil(); piste=PISTES[etat.jeu]; prochain=ctx.currentTime+0.06; pas=0;
    minuteur=setInterval(planifier,50); planifier();
  }
  function arreter(){
    if(minuteur){ clearInterval(minuteur); minuteur=null; }
    piste=null;
    endormir(8000);
  }

  var SONS={
    saut:function(t){ note(busFx,300,t,0.2,'square',0.28,900); },
    accroupi:function(t){ note(busFx,520,t,0.16,'triangle',0.35,170); souffle(busFx,t,0.1,0.12,'lowpass',700); },
    ramasse:function(t){ note(busFx,988,t,0.07,'triangle',0.32); note(busFx,1319,t+0.06,0.16,'triangle',0.3); },
    booster:function(t){ [392,523,659,784,1047].forEach(function(f,i){ note(busFx,f,t+i*0.055,0.14,'sawtooth',0.18,0,3000); }); },
    choc:function(t){ souffle(busFx,t,0.32,0.55,'lowpass',900); note(busFx,260,t,0.4,'sawtooth',0.3,55,1200); },
    record:function(t){ [523,659,784,1047,784,1047,1319].forEach(function(f,i){ note(busFx,f,t+i*0.085,0.2,'square',0.2,0,4000); }); },
    couteau:couteau,
    tranche:function(t){ souffle(busFx,t,0.14,0.3,'highpass',3500); note(busFx,1400,t,0.12,'sawtooth',0.14,300); },
    carte:function(t){ note(busFx,440,t,0.09,'triangle',0.3); note(busFx,554,t+0.07,0.09,'triangle',0.3); note(busFx,880,t+0.14,0.2,'triangle',0.3); },
    vie:function(t){ [659,784,988,1319].forEach(function(f,i){ note(busFx,f,t+i*0.08,0.2,'sine',0.38); }); },
    sirene:function(t){ note(busFx,620,t,0.24,'triangle',0.3,880); note(busFx,880,t+0.24,0.24,'triangle',0.3,620); },
    sifflet:function(t){ note(busFx,2300,t,0.22,'sine',0.3,2700); note(busFx,2700,t+0.1,0.14,'sine',0.22,2300); },
    niveau:function(t){ [523,659,784,659,784,1047,1319].forEach(function(f,i){ note(busFx,f,t+i*0.08,0.16,'square',0.18,0,3500); }); },
    perdu:function(t){ [440,392,330,262].forEach(function(f,i){ note(busFx,f,t+i*0.16,0.28,'sawtooth',0.2,f*0.94,1500); }); }
  };

  window.sonJeu={
    reglages:function(r){
      etat.musique=r.musique!==false; etat.bruitages=r.bruitages!==false;
      if(etat.musique) demarrer(); else arreter();
    },
    musique:function(jeu){
      etat.jeu=jeu||null;
      if(etat.jeu) demarrer(); else arreter();
    },
    jouer:function(nom){
      if(!etat.bruitages||!init()) return; reveil();
      var f=SONS[nom]; if(f) f(ctx.currentTime+0.01);
      if(!minuteur) endormir(8000);
    },
    reveil:function(){ if(init()) reveil(); },
    veille:function(){ arreter(); endormir(0); }
  };
  document.addEventListener('touchstart',function(){ if(init()) reveil(); },{passive:true});
})();
`;
