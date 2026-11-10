/**
 * Son des mini-jeux : une musique de fond différente par jeu (coupe, memoire,
 * drone, toits, sommet, rush) et des bruitages, deux interrupteurs
 * « Musique » et « Bruitages » gardés sur le téléphone (AsyncStorage,
 * clé jeux_son_v1).
 *
 * Aucun module natif, aucun fichier audio : tout est synthétisé en Web Audio
 * dans une WebView invisible (components/SonJeux.js) ; le Rush 3D embarque le
 * même moteur dans sa propre WebView. MOTEUR_AUDIO_JS est du JavaScript de
 * page web.
 *
 * API React Native (ce fichier) :
 *   chargerReglagesSon() -> Promise<{ musique, bruitages }>
 *   reglagesSon() -> { musique, bruitages }
 *   changerReglageSon('musique' | 'bruitages', booleen)
 *   ecouterReglagesSon(f) -> fonction de désabonnement
 *   JEUX_MUSIQUE : liste des jeux qui ont leur musique
 *   BRUITAGES : liste des noms de bruitages
 * Pour jouer, voir components/SonJeux.js (demarrerMusique, arreterMusique, bruit).
 *
 * Moteur (window.sonJeu dans la page) :
 *   reglages({ musique, bruitages }), choisir(jeu), musique(true|false),
 *   jouer(nom), reveil()
 * Bruitages : saut, accroupi, ramasse, booster, choc, record, tranche, carte,
 * vie, sirene, sifflet, niveau, perdu, plus les anciens (piece, bonus, tap,
 * palier, rebond, ok, rate).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'jeux_son_v1';
let reglages = { musique: true, bruitages: true };
let charge = false;
const abonnes = new Set();

export async function chargerReglagesSon() {
  if (charge) return reglages;
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (brut) {
      const r = JSON.parse(brut);
      reglages = { musique: r.musique !== false, bruitages: r.bruitages !== false };
    }
  } catch {
    // Réglages par défaut.
  }
  charge = true;
  return reglages;
}

export function reglagesSon() {
  return reglages;
}

export function changerReglageSon(cle, valeur) {
  reglages = { ...reglages, [cle]: !!valeur };
  charge = true;
  AsyncStorage.setItem(CLE, JSON.stringify(reglages)).catch(() => {});
  abonnes.forEach((f) => { try { f(reglages); } catch { /* rien */ } });
}

export function ecouterReglagesSon(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export const JEUX_MUSIQUE = ['coupe', 'memoire', 'drone', 'toits', 'sommet', 'rush'];
export const BRUITAGES = ['saut', 'accroupi', 'ramasse', 'booster', 'choc', 'record', 'tranche', 'carte', 'vie', 'sirene', 'sifflet', 'niveau', 'perdu'];

/**
 * Moteur Web Audio (page web). Expose window.sonJeu.
 * Chaque morceau : tempo (bpm), lead (32 pas de croche double, 0 = silence),
 * basse (32 pas), batterie (16 pas : k grosse caisse, s caisse claire, h charley).
 */
export const MOTEUR_AUDIO_JS = `
(function(){
  var ctx=null, maitre=null, busMus=null, busFx=null;
  var etat={musique:true,bruitages:true,joue:false,jeu:'rush'};
  var minuteur=null, prochain=0, pas=0, veille=null;
  // Sans musique, le contexte audio est mis en veille après le dernier son :
  // plus de calcul audio en pause, sur l'accueil ou la fin du jeu (batterie).
  function dormir(ms){ clearTimeout(veille); veille=setTimeout(function(){ if(!minuteur&&ctx&&ctx.state==='running'){ try{ctx.suspend();}catch(e){} } },ms||2000); }
  var PISTES={
    // Fruits express : pentatonique de do, joyeux et sautillant.
    coupe:{bpm:132,lt:'square',lv:0.15,bt:'triangle',bv:0.34,swing:0,
      L:[72,0,76,0,79,0,76,72, 74,0,79,0,81,79,76,0, 72,0,76,79,84,0,81,79, 76,74,72,0,67,0,0,0],
      B:[48,0,0,0,55,0,0,0, 50,0,0,0,57,0,0,0, 48,0,0,0,55,0,0,0, 43,0,0,0,52,0,55,0],
      D:'k.h.s.h.k.h.s.hh'},
    // Mémoire : boîte à musique, douce et rêveuse.
    memoire:{bpm:96,lt:'sine',lv:0.3,bt:'sine',bv:0.34,swing:0,
      L:[76,0,79,0,83,0,79,0, 77,0,81,0,84,0,81,0, 79,0,83,0,86,0,83,0, 81,0,79,0,76,0,0,0],
      B:[52,0,0,0,0,0,0,0, 53,0,0,0,0,0,0,0, 55,0,0,0,0,0,0,0, 57,0,0,0,55,0,0,0],
      D:'....h.......h...'},
    // Drone : arpèges planants de ré dorien, nappes en dents de scie.
    drone:{bpm:118,lt:'sawtooth',lv:0.1,bt:'triangle',bv:0.34,swing:0,
      L:[62,69,74,69, 65,72,77,72, 67,74,79,74, 64,71,76,71, 62,69,74,69, 65,72,77,72, 69,76,81,76, 67,74,79,0],
      B:[38,0,0,0,0,0,0,0, 41,0,0,0,0,0,0,0, 43,0,0,0,0,0,0,0, 40,0,0,0,0,0,0,0, 38,0,0,0,0,0,0,0, 41,0,0,0,0,0,0,0, 45,0,0,0,0,0,0,0, 43,0,0,0,0,0,0,0].slice(0,32),
      D:'k...h...k...h.h.'},
    // Toits : funk léger, basse pincée en mi mineur.
    toits:{bpm:112,lt:'square',lv:0.13,bt:'sawtooth',bv:0.16,swing:0.12,
      L:[0,0,76,0,0,79,0,76, 0,74,0,0,71,0,0,0, 0,0,76,0,0,79,0,83, 0,81,0,79,0,76,0,0],
      B:[40,0,40,0,0,43,0,40, 0,0,45,0,43,0,0,0, 40,0,40,0,0,43,0,47, 0,0,45,0,43,0,40,0],
      D:'k..hs..hk.h.s..h'},
    // Sommet : montée régulière en fa majeur, pas de marche.
    sommet:{bpm:104,lt:'triangle',lv:0.3,bt:'square',bv:0.1,swing:0,
      L:[65,0,69,0,72,0,77,0, 67,0,70,0,74,0,79,0, 69,0,72,0,77,0,81,0, 72,0,77,0,81,0,84,0],
      B:[41,0,41,0,48,0,48,0, 43,0,43,0,50,0,50,0, 45,0,45,0,52,0,52,0, 41,0,41,0,48,0,53,0],
      D:'k...s...k...s.hh'},
    // Rush : course rapide en la mineur, basse martelée.
    rush:{bpm:146,lt:'sawtooth',lv:0.1,bt:'square',bv:0.13,swing:0,
      L:[81,0,81,84,0,81,79,0, 76,0,76,79,0,76,74,0, 77,0,77,81,0,77,76,0, 74,76,77,76,74,72,71,0],
      B:[45,45,0,45,45,0,45,45, 40,40,0,40,40,0,40,40, 41,41,0,41,41,0,41,41, 43,43,0,43,43,0,43,43],
      D:'k.hhs.hhk.hhs.hh'}
  };
  function init(){
    if(ctx) return true;
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
    try{ ctx=new AC(); }catch(e){ return false; }
    maitre=ctx.createGain(); maitre.gain.value=0.9; maitre.connect(ctx.destination);
    busMus=ctx.createGain(); busMus.gain.value=0.16; busMus.connect(maitre);
    busFx=ctx.createGain(); busFx.gain.value=0.45; busFx.connect(maitre);
    return true;
  }
  function reveil(){ if(ctx&&ctx.state==='suspended'){ try{ctx.resume();}catch(e){} } }
  function note(bus,f,t,d,type,vol,glisse){
    var o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type||'square'; o.frequency.setValueAtTime(f,t);
    if(glisse) o.frequency.exponentialRampToValueAtTime(glisse,t+d);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol||0.3,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t+d+0.02);
  }
  function souffle(bus,t,d,vol,type,freq){
    var n=Math.floor(ctx.sampleRate*d), b=ctx.createBuffer(1,n,ctx.sampleRate), c=b.getChannelData(0);
    for(var i=0;i<n;i++) c[i]=(Math.random()*2-1)*(1-i/n);
    var s=ctx.createBufferSource(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    f.type=type||'lowpass'; f.frequency.value=freq||900; s.buffer=b; g.gain.value=vol||0.4;
    s.connect(f); f.connect(g); g.connect(bus); s.start(t);
  }
  function bruit(t,d,vol){ souffle(busFx,t,d,vol,'lowpass',900); }
  function hz(m){ return 440*Math.pow(2,(m-69)/12); }
  function batterie(c,t,pasD,bpm){
    if(c==='k') note(busMus,150,t,0.14,'sine',0.7,45);
    else if(c==='s') souffle(busMus,t,0.12,0.22,'bandpass',1800);
    else if(c==='h') souffle(busMus,t,0.04,0.1,'highpass',6500);
  }
  function planifier(){
    var p=PISTES[etat.jeu]||PISTES.rush;
    var croche=60/p.bpm/4;
    while(prochain<ctx.currentTime+0.25){
      var i=pas%32, t=prochain+((i%2===1)?croche*p.swing:0);
      var m=p.L[i%p.L.length]; if(m) note(busMus,hz(m),t,croche*(p.lt==='sine'?4:1.7),p.lt,p.lv);
      var b=p.B[i%p.B.length]; if(b) note(busMus,hz(b),t,croche*(p.bt==='sine'?3:1.9),p.bt,p.bv);
      batterie(p.D.charAt(i%p.D.length),t,croche,p.bpm);
      prochain+=croche; pas++;
    }
  }
  function demarrer(){
    if(!etat.musique||!etat.joue||minuteur||!init()) return;
    clearTimeout(veille); reveil(); prochain=ctx.currentTime+0.05; pas=0;
    minuteur=setInterval(planifier,60); planifier();
  }
  function arreter(){ if(minuteur){ clearInterval(minuteur); minuteur=null; } dormir(); }
  var SONS={
    saut:function(t){ note(busFx,330,t,0.18,'square',0.3,880); },
    accroupi:function(t){ note(busFx,420,t,0.16,'triangle',0.4,140); },
    piece:function(t){ note(busFx,988,t,0.07,'square',0.25); note(busFx,1319,t+0.07,0.18,'square',0.25); },
    ramasse:function(t){ note(busFx,880,t,0.06,'triangle',0.4); note(busFx,1175,t+0.06,0.06,'triangle',0.4); note(busFx,1568,t+0.12,0.16,'triangle',0.35); },
    bonus:function(t){ [523,659,784,1047].forEach(function(f,i){ note(busFx,f,t+i*0.06,0.12,'square',0.25); }); },
    booster:function(t){ [392,523,659,784,1047,1319].forEach(function(f,i){ note(busFx,f,t+i*0.045,0.12,'sawtooth',0.2); }); souffle(busFx,t,0.3,0.15,'highpass',3000); },
    choc:function(t){ bruit(t,0.3,0.5); note(busFx,300,t,0.45,'sawtooth',0.3,60); },
    record:function(t){ [523,659,784,1047,784,1047,1319].forEach(function(f,i){ note(busFx,f,t+i*0.1,0.2,'square',0.22); }); },
    tranche:function(t){ souffle(busFx,t,0.14,0.5,'highpass',2500); note(busFx,1400,t,0.1,'triangle',0.25,500); },
    carte:function(t){ note(busFx,700,t,0.07,'triangle',0.35,1100); note(busFx,1250,t+0.05,0.08,'sine',0.25); },
    vie:function(t){ [659,784,1047].forEach(function(f,i){ note(busFx,f,t+i*0.09,0.2,'sine',0.4); }); },
    sirene:function(t){ for(var i=0;i<4;i++) note(busFx,i%2?700:920,t+i*0.2,0.19,'square',0.2); },
    sifflet:function(t){ note(busFx,1900,t,0.12,'sine',0.35,2400); note(busFx,2400,t+0.12,0.2,'sine',0.35,2200); },
    niveau:function(t){ [523,659,784,659,784,1047].forEach(function(f,i){ note(busFx,f,t+i*0.09,0.14,'square',0.22); }); },
    perdu:function(t){ [392,330,262,196].forEach(function(f,i){ note(busFx,f,t+i*0.16,0.3,'triangle',0.4); }); },
    tap:function(t){ note(busFx,660,t,0.06,'triangle',0.35,990); },
    rebond:function(t){ note(busFx,260,t,0.14,'triangle',0.4,620); },
    ok:function(t){ note(busFx,784,t,0.08,'triangle',0.35); note(busFx,1175,t+0.06,0.12,'triangle',0.3); },
    rate:function(t){ note(busFx,220,t,0.25,'square',0.25,110); }
  };
  SONS.palier=SONS.niveau;
  window.sonJeu={
    reglages:function(r){ etat.musique=r.musique!==false; etat.bruitages=r.bruitages!==false; if(etat.musique) demarrer(); else arreter(); },
    choisir:function(jeu){ var nouveau=PISTES[jeu]?jeu:'rush'; if(nouveau===etat.jeu) return; etat.jeu=nouveau; if(minuteur){ arreter(); demarrer(); } },
    musique:function(on){ etat.joue=!!on; if(on) demarrer(); else arreter(); },
    jouer:function(nom){ if(!etat.bruitages||!init()) return; reveil(); var f=SONS[nom]; if(f) f(ctx.currentTime+0.01); if(!minuteur) dormir(2500); },
    reveil:function(){ if(init()){ reveil(); if(!minuteur) dormir(); } }
  };
  document.addEventListener('touchstart',function(){ if(init()){ reveil(); if(!minuteur) dormir(); } },{passive:true});
})();
`;
