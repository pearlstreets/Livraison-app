/**
 * Son des mini-jeux : musique de fond douce et bruitages, chacun coupable
 * dans les réglages de l'écran « Jeux » (gardés sur le téléphone).
 *
 * Aucun module natif : le son est synthétisé en Web Audio dans une WebView
 * invisible (components/SonJeux.js) ; le Rush 3D embarque le même moteur dans
 * sa propre WebView. MOTEUR_AUDIO_JS est donc du JavaScript de page web.
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

/**
 * Moteur Web Audio (page web). Expose window.sonJeu :
 *   reglages({ musique, bruitages }), musique(true|false), jouer(nom)
 * Bruitages : saut, piece, bonus, choc, tap, palier, rebond, ok, rate.
 */
export const MOTEUR_AUDIO_JS = `
(function(){
  var ctx=null, maitre=null, busMus=null, busFx=null;
  var etat={musique:true,bruitages:true,joue:false};
  var minuteur=null, prochain=0, pas=0;
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
  function bruit(t,d,vol){
    var n=Math.floor(ctx.sampleRate*d), b=ctx.createBuffer(1,n,ctx.sampleRate), c=b.getChannelData(0);
    for(var i=0;i<n;i++) c[i]=(Math.random()*2-1)*(1-i/n);
    var s=ctx.createBufferSource(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    f.type='lowpass'; f.frequency.value=900; s.buffer=b; g.gain.value=vol||0.4;
    s.connect(f); f.connect(g); g.connect(busFx); s.start(t);
  }
  function hz(m){ return 440*Math.pow(2,(m-69)/12); }
  // Mélodie originale guillerette en do majeur, 4 mesures (do, sol, la mineur, fa).
  var MEL=[72,76,79,76, 74,79,83,79, 76,72,76,81, 77,76,74,0,
           72,76,79,84, 83,79,74,79, 81,76,72,76, 77,74,72,0];
  var BAS=[48,48,55,55, 43,43,50,50, 45,45,52,52, 41,41,48,48];
  var NOIRE=0.2;
  function planifier(){
    while(prochain<ctx.currentTime+0.25){
      var i=pas%MEL.length;
      if(MEL[i]) note(busMus,hz(MEL[i]),prochain,NOIRE*0.9,'square',0.18);
      if(i%2===0) note(busMus,hz(BAS[(i/2)%BAS.length]),prochain,NOIRE*1.8,'triangle',0.35);
      if(i%4===2) bruitDoux(prochain);
      prochain+=NOIRE; pas++;
    }
  }
  function bruitDoux(t){
    var n=Math.floor(ctx.sampleRate*0.04), b=ctx.createBuffer(1,n,ctx.sampleRate), c=b.getChannelData(0);
    for(var i=0;i<n;i++) c[i]=(Math.random()*2-1)*(1-i/n);
    var s=ctx.createBufferSource(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    f.type='highpass'; f.frequency.value=6000; s.buffer=b; g.gain.value=0.12;
    s.connect(f); f.connect(g); g.connect(busMus); s.start(t);
  }
  function demarrer(){
    if(!etat.musique||!etat.joue||minuteur||!init()) return;
    reveil(); prochain=ctx.currentTime+0.05; pas=0;
    minuteur=setInterval(planifier,60); planifier();
  }
  function arreter(){ if(minuteur){ clearInterval(minuteur); minuteur=null; } }
  var SONS={
    saut:function(t){ note(busFx,330,t,0.18,'square',0.3,880); },
    piece:function(t){ note(busFx,988,t,0.07,'square',0.25); note(busFx,1319,t+0.07,0.18,'square',0.25); },
    bonus:function(t){ [523,659,784,1047].forEach(function(f,i){ note(busFx,f,t+i*0.06,0.12,'square',0.25); }); },
    choc:function(t){ bruit(t,0.3,0.5); note(busFx,300,t,0.45,'sawtooth',0.3,60); },
    tap:function(t){ note(busFx,660,t,0.06,'triangle',0.35,990); },
    rebond:function(t){ note(busFx,260,t,0.14,'triangle',0.4,620); },
    ok:function(t){ note(busFx,784,t,0.08,'triangle',0.35); note(busFx,1175,t+0.06,0.12,'triangle',0.3); },
    rate:function(t){ note(busFx,220,t,0.25,'square',0.25,110); },
    palier:function(t){ [523,659,784,659,784,1047].forEach(function(f,i){ note(busFx,f,t+i*0.09,0.14,'square',0.22); }); }
  };
  window.sonJeu={
    reglages:function(r){ etat.musique=r.musique!==false; etat.bruitages=r.bruitages!==false; if(etat.musique) demarrer(); else arreter(); },
    musique:function(on){ etat.joue=!!on; if(on) demarrer(); else arreter(); },
    jouer:function(nom){ if(!etat.bruitages||!init()) return; reveil(); var f=SONS[nom]; if(f) f(ctx.currentTime+0.01); },
    reveil:function(){ if(init()) reveil(); }
  };
  document.addEventListener('touchstart',function(){ if(init()) reveil(); },{passive:true});
})();
`;
