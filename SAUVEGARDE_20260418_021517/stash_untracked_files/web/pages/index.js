import { useState, useEffect } from 'react';
import Head from 'next/head';
import {
  Box, Container, Typography, TextField, Button, Paper, Tabs, Tab,
  Alert, CircularProgress, IconButton, InputAdornment, Chip, Divider,
  Card, CardContent, Grid, List, ListItem, ListItemText,
  Select, MenuItem, FormControl, InputLabel, LinearProgress, Snackbar,
  FormControlLabel, Checkbox,
} from '@mui/material';
import {
  Visibility, VisibilityOff, CheckCircle, HourglassEmpty,
  Cancel, Person, Description, EuroSymbol, History, Lock, Logout,
  LocalShipping, PhoneAndroid, Speed, AttachMoney, ArrowForward,
  TwoWheeler, DirectionsBike, DirectionsCar, DirectionsWalk,
} from '@mui/icons-material';
import api from '../lib/api';
import { login as apiLogin, register as apiRegister, logout as apiLogout, changePassword, forgotPassword, getStoredUser } from '../lib/auth';

const B = '#00C29B';
const DARK = '#0a0a0a';
const R = 1.5; // global border-radius (less rounded)
const GLASS = { bgcolor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' };
const GLASS_W = { bgcolor: '#fff', border: '1px solid #e8e8e8', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' };
const INPUT_SX = { '& .MuiOutlinedInput-root': { borderRadius: R, bgcolor: '#fafafa', '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: B }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: B } } };
const BTN_SX = { py: 1.5, fontWeight: 700, textTransform: 'none', fontSize: 15, borderRadius: R };

function StatusChip({ status }) {
  const m = { pending: { l: 'En attente', c: 'warning', i: <HourglassEmpty fontSize="small" /> }, approved: { l: 'Approuve', c: 'success', i: <CheckCircle fontSize="small" /> }, rejected: { l: 'Refuse', c: 'error', i: <Cancel fontSize="small" /> } };
  const s = m[status] || m.pending;
  return <Chip icon={s.i} label={s.l} color={s.c} size="small" variant="outlined" />;
}

// Shared logo
function Logo({ size = 56, light }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: size / 4, bgcolor: light ? '#fff' : '#111', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography sx={{ fontSize: size * 0.43, fontWeight: 900, color: light ? '#111' : '#fff' }}>P</Typography>
    </Box>
  );
}

// Dark page wrapper for auth pages
function AuthPage({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', background: `linear-gradient(135deg, ${DARK} 0%, #1a1a2e 50%, #16213e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      {children}
    </Box>
  );
}

// ===================== LANDING =====================
function LandingSection({ onLogin, onRegister }) {
  return (
    <Box sx={{ minHeight: '100vh', background: `linear-gradient(135deg, ${DARK} 0%, #1a1a2e 50%, #16213e 100%)`, overflow: 'hidden' }}>
      {/* Nav */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 3, md: 6 }, py: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Logo size={40} />
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>Pearl Delivery</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button onClick={onLogin} sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'none', fontWeight: 600, '&:hover': { color: '#fff' } }}>Se connecter</Button>
          <Button onClick={onRegister} variant="contained" sx={{ ...BTN_SX, py: 1, px: 3, bgcolor: B, '&:hover': { bgcolor: '#00a884' } }}>Devenir livreur</Button>
        </Box>
      </Box>

      {/* Hero */}
      <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 14 }, pb: 10, textAlign: 'center', position: 'relative' }}>
        {/* Glow */}
        <Box sx={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${B}22 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <Typography sx={{ color: B, fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', mb: 2 }}>
          Plateforme de livraison
        </Typography>
        <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: { xs: 36, md: 56 }, lineHeight: 1.1, mb: 3 }}>
          Livrez avec{' '}
          <Box component="span" sx={{ background: `linear-gradient(90deg, ${B}, #00e6b0)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Pearl Streets
          </Box>
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: { xs: 16, md: 20 }, maxWidth: 550, mx: 'auto', mb: 5, lineHeight: 1.6 }}>
          Gerez vos courses, suivez vos gains en temps reel et encaissez rapidement.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 8 }}>
          <Button onClick={onRegister} variant="contained" size="large" endIcon={<ArrowForward />} sx={{ ...BTN_SX, px: 4, fontSize: 16, bgcolor: B, '&:hover': { bgcolor: '#00a884' } }}>
            Commencer maintenant
          </Button>
          <Button onClick={onLogin} variant="outlined" size="large" sx={{ ...BTN_SX, px: 4, fontSize: 16, color: '#fff', borderColor: 'rgba(255,255,255,0.25)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}>
            J'ai deja un compte
          </Button>
        </Box>

        {/* Features */}
        <Grid container spacing={2.5}>
          {[
            { icon: <LocalShipping sx={{ fontSize: 28 }} />, title: 'Livraisons flexibles', desc: 'Choisissez vos horaires' },
            { icon: <AttachMoney sx={{ fontSize: 28 }} />, title: 'Gains transparents', desc: 'Suivez vos revenus en direct' },
            { icon: <Speed sx={{ fontSize: 28 }} />, title: 'Paiement rapide', desc: 'Encaissez sous 30 min' },
            { icon: <PhoneAndroid sx={{ fontSize: 28 }} />, title: 'App mobile', desc: 'Livrez depuis votre telephone' },
          ].map((f, i) => (
            <Grid item xs={6} md={3} key={i}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: R, textAlign: 'center', ...GLASS, transition: 'transform 0.2s, border-color 0.2s', '&:hover': { transform: 'translateY(-4px)', borderColor: `${B}66` } }}>
                <Box sx={{ color: B, mb: 1.5 }}>{f.icon}</Box>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, mb: 0.5 }}>{f.title}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{f.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Footer */}
      <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Pearl Streets {new Date().getFullYear()}</Typography>
      </Box>
    </Box>
  );
}

// ===================== LOGIN =====================
function LoginSection({ onBack, onSuccess, onForgot, onRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!email || !password) { setError('Remplissez tous les champs'); return; }
    setLoading(true);
    try { const data = await apiLogin(email, password); onSuccess(data.user); }
    catch (err) { setError(err.response?.data?.message || 'Email ou mot de passe incorrect'); }
    setLoading(false);
  };

  return (
    <AuthPage>
      <Paper elevation={0} sx={{ p: { xs: 3.5, md: 5 }, maxWidth: 440, width: '100%', borderRadius: R, ...GLASS_W }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Logo size={48} />
          <Typography sx={{ mt: 2, fontWeight: 800, fontSize: 24, color: '#111' }}>Connexion</Typography>
          <Typography sx={{ color: '#888', fontSize: 14, mt: 0.5 }}>Accedez a votre espace livreur</Typography>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: R }}>{error}</Alert>}
        <form onSubmit={handleSubmit}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 0.5 }}>Email</Typography>
          <TextField fullWidth placeholder="vous@exemple.com" type="email" value={email} onChange={e => setEmail(e.target.value)} sx={{ mb: 2.5, ...INPUT_SX }} size="small" />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 0.5 }}>Mot de passe</Typography>
          <TextField fullWidth placeholder="••••••••" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} size="small"
            InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd(!showPwd)} edge="end" size="small">{showPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</IconButton></InputAdornment> }}
            sx={{ mb: 0.5, ...INPUT_SX }} />
          <Box sx={{ textAlign: 'right', mb: 2.5 }}>
            <Button size="small" onClick={onForgot} sx={{ textTransform: 'none', color: B, fontSize: 12, fontWeight: 600, p: 0 }}>Mot de passe oublie ?</Button>
          </Box>
          <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ ...BTN_SX, bgcolor: '#111', '&:hover': { bgcolor: '#333' } }}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Se connecter'}
          </Button>
        </form>
        <Divider sx={{ my: 3 }}><Typography sx={{ color: '#ccc', fontSize: 12 }}>ou</Typography></Divider>
        <Button fullWidth variant="outlined" onClick={onRegister} sx={{ ...BTN_SX, color: B, borderColor: B, '&:hover': { bgcolor: `${B}0a`, borderColor: B } }}>
          Creer un compte
        </Button>
        <Button size="small" onClick={onBack} sx={{ mt: 2, textTransform: 'none', display: 'block', mx: 'auto', color: '#aaa', fontSize: 13 }}>Retour</Button>
      </Paper>
    </AuthPage>
  );
}

// ===================== REGISTER =====================
function RegisterSection({ onBack, onSuccess, onLogin }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ userName: '', email: '', password: '', phone: '', phoneCode: '+33', vehicle_type: 'scooter' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleStep1 = (e) => { e.preventDefault(); setError(''); if (!form.email || !form.password) { setError('Remplissez tous les champs'); return; } if (form.password.length < 6) { setError('6 caracteres minimum'); return; } setStep(2); };
  const handleStep2 = async (e) => { e.preventDefault(); setError(''); if (!form.userName || !form.phone) { setError('Remplissez tous les champs'); return; } if (!consent) { setError('Vous devez accepter les conditions'); return; } setLoading(true); try { await apiRegister(form); onSuccess(); } catch (err) { setError(err.response?.data?.message || err.response?.data?.errors?.email?.[0] || 'Erreur'); } setLoading(false); };

  const vehicles = [
    { value: 'scooter', label: 'Scooter', icon: <TwoWheeler /> },
    { value: 'bicycle', label: 'Velo', icon: <DirectionsBike /> },
    { value: 'car', label: 'Voiture', icon: <DirectionsCar /> },
    { value: 'walk', label: 'A pied', icon: <DirectionsWalk /> },
  ];

  return (
    <AuthPage>
      <Paper elevation={0} sx={{ p: { xs: 3.5, md: 5 }, maxWidth: 480, width: '100%', borderRadius: R, ...GLASS_W }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Logo size={48} />
          <Typography sx={{ mt: 2, fontWeight: 800, fontSize: 24, color: '#111' }}>Devenir livreur</Typography>
          <Typography sx={{ color: '#888', fontSize: 14, mt: 0.5 }}>Etape {step} sur 2</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Box sx={{ flex: 1, height: 4, borderRadius: R, bgcolor: B }} />
            <Box sx={{ flex: 1, height: 4, borderRadius: R, bgcolor: step >= 2 ? B : '#eee' }} />
          </Box>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: R }}>{error}</Alert>}

        {step === 1 ? (
          <form onSubmit={handleStep1}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 0.5 }}>Email</Typography>
            <TextField fullWidth placeholder="vous@exemple.com" type="email" value={form.email} onChange={set('email')} sx={{ mb: 2.5, ...INPUT_SX }} size="small" />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 0.5 }}>Mot de passe</Typography>
            <TextField fullWidth placeholder="6 caracteres minimum" type="password" value={form.password} onChange={set('password')} sx={{ mb: 3, ...INPUT_SX }} size="small" />
            <Button fullWidth variant="contained" type="submit" sx={{ ...BTN_SX, bgcolor: '#111', '&:hover': { bgcolor: '#333' } }}>Continuer</Button>
          </form>
        ) : (
          <form onSubmit={handleStep2}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 0.5 }}>Nom complet</Typography>
            <TextField fullWidth placeholder="Jean Dupont" value={form.userName} onChange={set('userName')} sx={{ mb: 2, ...INPUT_SX }} size="small" />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 0.5 }}>Telephone</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
              <TextField placeholder="+33" value={form.phoneCode} onChange={set('phoneCode')} sx={{ width: 90, ...INPUT_SX }} size="small" />
              <TextField fullWidth placeholder="6 12 34 56 78" value={form.phone} onChange={set('phone')} sx={INPUT_SX} size="small" />
            </Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#555', mb: 1 }}>Vehicule</Typography>
            <Grid container spacing={1} sx={{ mb: 3 }}>
              {vehicles.map(v => (
                <Grid item xs={3} key={v.value}>
                  <Paper onClick={() => setForm(p => ({ ...p, vehicle_type: v.value }))} elevation={0} sx={{ p: 1.5, textAlign: 'center', borderRadius: R, cursor: 'pointer', border: `2px solid ${form.vehicle_type === v.value ? B : '#eee'}`, bgcolor: form.vehicle_type === v.value ? `${B}0a` : '#fafafa', transition: 'all 0.15s' }}>
                    <Box sx={{ color: form.vehicle_type === v.value ? B : '#bbb', mb: 0.5 }}>{v.icon}</Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: form.vehicle_type === v.value ? '#111' : '#aaa' }}>{v.label}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <FormControlLabel control={<Checkbox checked={consent} onChange={e => setConsent(e.target.checked)} sx={{ color: B, '&.Mui-checked': { color: B } }} />}
              label={<Typography sx={{ fontSize: 12, color: '#666' }}>J'accepte les conditions d'utilisation et la politique de confidentialite</Typography>} sx={{ mb: 2, alignItems: 'flex-start' }} />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button variant="outlined" onClick={() => setStep(1)} sx={{ ...BTN_SX, flex: 1, color: '#666', borderColor: '#ddd' }}>Retour</Button>
              <Button variant="contained" type="submit" disabled={loading || !consent} sx={{ ...BTN_SX, flex: 2, bgcolor: '#111', '&:hover': { bgcolor: '#333' }, ...(!consent && { opacity: 0.5 }) }}>
                {loading ? <CircularProgress size={20} color="inherit" /> : "S'inscrire"}
              </Button>
            </Box>
          </form>
        )}
        <Divider sx={{ my: 2.5 }} />
        <Typography variant="body2" align="center" sx={{ color: 'text.secondary' }}>
          Deja inscrit ? <Button size="small" onClick={onLogin} sx={{ textTransform: 'none', fontWeight: 700, color: B }}>Se connecter</Button>
        </Typography>
        <Button size="small" onClick={onBack} sx={{ mt: 1, textTransform: 'none', display: 'block', mx: 'auto', color: 'text.secondary' }}>Retour</Button>
      </Paper>
    </AuthPage>
  );
}

// ===================== FORGOT =====================
function ForgotSection({ onBack }) {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => { e.preventDefault(); setError(''); if (!email) { setError('Entrez votre email'); return; } setLoading(true); try { await forgotPassword(email); setSent(true); } catch (err) { setError(err.response?.data?.message || 'Erreur'); } setLoading(false); };

  return (
    <AuthPage>
      <Paper elevation={0} sx={{ p: 5, maxWidth: 440, width: '100%', borderRadius: R, textAlign: 'center', ...GLASS_W }}>
        <Logo size={52} />
        <Typography sx={{ mt: 2, fontWeight: 800, fontSize: 22, mb: 1 }}>Mot de passe oublie</Typography>
        {sent ? (
          <>
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>Email de reinitialisation envoye.</Alert>
            <Button onClick={onBack} sx={{ textTransform: 'none', color: B }}>Retour</Button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <Typography sx={{ color: 'text.secondary', fontSize: 14, mb: 3 }}>Entrez votre email pour recevoir un lien</Typography>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
            <TextField fullWidth label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} sx={{ mb: 3, ...INPUT_SX }} />
            <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ ...BTN_SX, bgcolor: B, '&:hover': { bgcolor: '#00a884' } }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Envoyer'}
            </Button>
            <Button size="small" onClick={onBack} sx={{ mt: 2, textTransform: 'none', color: 'text.secondary' }}>Retour</Button>
          </form>
        )}
      </Paper>
    </AuthPage>
  );
}

// ===================== PENDING =====================
function PendingSection({ onLogout }) {
  return (
    <AuthPage>
      <Paper elevation={0} sx={{ p: 5, maxWidth: 480, width: '100%', borderRadius: R, textAlign: 'center', ...GLASS_W }}>
        <Box sx={{ width: 80, height: 80, borderRadius: '50%', bgcolor: '#FEF3C7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
          <HourglassEmpty sx={{ fontSize: 40, color: '#F59E0B' }} />
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: 22, mb: 1 }}>Compte en attente</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 15, mb: 3, lineHeight: 1.6 }}>
          Notre equipe verifie vos informations. Vous recevrez un email sous 24-48h.
        </Typography>
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, bgcolor: '#f0fdf4', border: `1px solid ${B}33`, mb: 3, textAlign: 'left' }}>
          {[
            { icon: <CheckCircle sx={{ fontSize: 18, color: B }} />, text: 'Inscription soumise' },
            { icon: <HourglassEmpty sx={{ fontSize: 18, color: '#F59E0B' }} />, text: 'Verification en cours' },
            { icon: <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #ddd' }} />, text: 'Compte active' },
          ].map((s, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.8 }}>
              {s.icon}
              <Typography sx={{ fontSize: 14, color: i < 2 ? '#333' : '#aaa' }}>{s.text}</Typography>
            </Box>
          ))}
        </Paper>
        <Button variant="outlined" onClick={onLogout} sx={{ ...BTN_SX, color: '#666', borderColor: '#ddd' }}>Se deconnecter</Button>
      </Paper>
    </AuthPage>
  );
}

// ===================== DASHBOARD =====================
function DashboardSection({ user, onLogout }) {
  const [tab, setTab] = useState(0);
  const [profile, setProfile] = useState(user);
  const [earnings, setEarnings] = useState([]);
  const [history, setHistory] = useState([]);
  const [snack, setSnack] = useState('');
  const [oldPwd, setOldPwd] = useState(''); const [newPwd, setNewPwd] = useState(''); const [pwdError, setPwdError] = useState('');

  useEffect(() => { setProfile(user); }, [user]);
  useEffect(() => {
    if (tab === 2) api.get('/delivery/earnings/').then(({ data }) => setEarnings(data.results || [])).catch(() => {});
    if (tab === 3) api.get('/delivery/history/').then(({ data }) => setHistory(data.results || [])).catch(() => {});
  }, [tab]);

  const handleChangePwd = async (e) => { e.preventDefault(); setPwdError(''); if (!oldPwd || !newPwd) { setPwdError('Remplissez les deux champs'); return; } try { await changePassword(oldPwd, newPwd); setSnack('Mot de passe modifie'); setOldPwd(''); setNewPwd(''); } catch (err) { setPwdError(err.response?.data?.message || 'Erreur'); } };

  const stats = [
    { label: 'Livraisons', value: profile?.total_deliveries || 0, color: B },
    { label: 'Note', value: profile?.rating ? `${parseFloat(profile.rating).toFixed(1)}` : '-', color: '#F59E0B' },
    { label: 'Gains totaux', value: profile?.total_earnings ? `${parseFloat(profile.total_earnings).toFixed(0)}\u20ac` : '0\u20ac', color: '#8B5CF6' },
  ];

  const docs = [
    { key: 'identityCardFront_status', label: "Identite (recto)", icon: '🪪' },
    { key: 'identityCardBack_status', label: "Identite (verso)", icon: '🪪' },
    { key: 'iban_status', label: 'IBAN / RIB', icon: '🏦' },
    { key: 'kbiss_status', label: 'KBISS', icon: '📄' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}>
      {/* Header */}
      <Box sx={{ background: `linear-gradient(135deg, ${DARK}, #1a1a2e)`, px: { xs: 2, md: 4 }, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Logo size={36} />
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>Pearl Delivery</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip label={profile?.is_verified ? 'Verifie' : 'En attente'} size="small" sx={{ bgcolor: profile?.is_verified ? `${B}22` : '#FEF3C722', color: profile?.is_verified ? B : '#F59E0B', fontWeight: 600, border: `1px solid ${profile?.is_verified ? `${B}44` : '#F59E0B44'}` }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500, display: { xs: 'none', md: 'block' } }}>{profile?.userName || profile?.email}</Typography>
          <IconButton onClick={onLogout} size="small" sx={{ color: 'rgba(255,255,255,0.5)' }}><Logout fontSize="small" /></IconButton>
        </Box>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
        {/* Stats */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {stats.map((s, i) => (
            <Grid item xs={4} key={i}>
              <Paper elevation={0} sx={{ p: 2.5, textAlign: 'center', borderRadius: R, border: '1px solid #eee', position: 'relative', overflow: 'hidden' }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: s.color }} />
                <Typography sx={{ fontWeight: 900, fontSize: { xs: 22, md: 28 }, color: '#111' }}>{s.value}</Typography>
                <Typography sx={{ color: '#999', fontSize: 13, fontWeight: 500 }}>{s.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* App banner */}
        <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderRadius: R, display: 'flex', alignItems: 'center', gap: 2, background: `linear-gradient(135deg, ${DARK}, #1a1a2e)` }}>
          <PhoneAndroid sx={{ color: B, fontSize: 28 }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Telechargez l'app Pearl Delivery</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Pour recevoir et gerer vos livraisons</Typography>
          </Box>
          <Button size="small" sx={{ color: B, textTransform: 'none', fontWeight: 700 }}>Bientot</Button>
        </Paper>

        {/* Tabs */}
        <Paper elevation={0} sx={{ borderRadius: R, border: '1px solid #eee', overflow: 'hidden' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ bgcolor: '#fafafa', '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 56 }, '& .Mui-selected': { color: `${B} !important` }, '& .MuiTabs-indicator': { bgcolor: B } }}>
            <Tab label="Profil" icon={<Person sx={{ fontSize: 20 }} />} iconPosition="start" />
            <Tab label="Documents" icon={<Description sx={{ fontSize: 20 }} />} iconPosition="start" />
            <Tab label="Gains" icon={<EuroSymbol sx={{ fontSize: 20 }} />} iconPosition="start" />
            <Tab label="Historique" icon={<History sx={{ fontSize: 20 }} />} iconPosition="start" />
            <Tab label="Securite" icon={<Lock sx={{ fontSize: 20 }} />} iconPosition="start" />
          </Tabs>

          <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {tab === 0 && (
              <List disablePadding>
                {[
                  { label: 'Nom', value: profile?.userName },
                  { label: 'Email', value: profile?.email },
                  { label: 'Telephone', value: profile?.phone ? `${profile?.phoneCode || ''} ${profile.phone}` : '-' },
                  { label: 'Vehicule', value: profile?.vehicle_type },
                  { label: 'Statut', value: profile?.account_active !== false ? 'Actif' : 'Desactive' },
                  { label: 'Inscrit le', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR') : '-' },
                ].map((item, i) => (
                  <ListItem key={i} sx={{ px: 0, py: 1.5, borderBottom: '1px solid #f5f5f5' }}>
                    <ListItemText primary={item.label} secondary={item.value || '-'} primaryTypographyProps={{ fontWeight: 500, fontSize: 13, color: '#999' }} secondaryTypographyProps={{ fontSize: 15, color: '#111', fontWeight: 600 }} />
                  </ListItem>
                ))}
              </List>
            )}

            {tab === 1 && docs.map((doc, i) => (
              <Paper key={i} elevation={0} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, mb: 1.5, borderRadius: 2, bgcolor: '#fafafa', border: '1px solid #f0f0f0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontSize: 20 }}>{doc.icon}</Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{doc.label}</Typography>
                </Box>
                <StatusChip status={profile?.[doc.key] || 'pending'} />
              </Paper>
            ))}

            {tab === 2 && (earnings.length > 0 ? earnings.map((e, i) => (
              <Paper key={i} elevation={0} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, mb: 1.5, borderRadius: 2, bgcolor: '#fafafa', border: '1px solid #f0f0f0' }}>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{e.period_start} - {e.period_end}</Typography>
                  <Typography sx={{ color: '#999', fontSize: 12 }}>{e.total_deliveries} livraisons</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 800, color: B }}>{parseFloat(e.net_amount).toFixed(2)} &euro;</Typography>
                  <Chip label={e.status === 'paid' ? 'Verse' : 'En attente'} size="small" sx={{ fontSize: 11, height: 22 }} color={e.status === 'paid' ? 'success' : 'default'} />
                </Box>
              </Paper>
            )) : <Typography sx={{ color: '#aaa', textAlign: 'center', py: 5 }}>Aucun gain pour le moment</Typography>)}

            {tab === 3 && (history.length > 0 ? history.map((h, i) => (
              <Paper key={i} elevation={0} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, mb: 1.5, borderRadius: 2, bgcolor: '#fafafa', border: '1px solid #f0f0f0' }}>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{h.customer_name || 'Commande'}</Typography>
                  <Typography sx={{ color: '#999', fontSize: 12 }}>{h.dropoff_address || '-'}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 700 }}>{h.delivery_fee ? `${parseFloat(h.delivery_fee).toFixed(2)} \u20ac` : '-'}</Typography>
                  <Chip label={h.status === 'delivered' ? 'Livre' : h.status === 'cancelled' ? 'Annule' : h.status} size="small" sx={{ fontSize: 11, height: 22 }} color={h.status === 'delivered' ? 'success' : h.status === 'cancelled' ? 'error' : 'default'} />
                </Box>
              </Paper>
            )) : <Typography sx={{ color: '#aaa', textAlign: 'center', py: 5 }}>Aucune livraison</Typography>)}

            {tab === 4 && (
              <form onSubmit={handleChangePwd} style={{ maxWidth: 400 }}>
                {pwdError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{pwdError}</Alert>}
                <TextField fullWidth label="Mot de passe actuel" type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} sx={{ mb: 2, ...INPUT_SX }} />
                <TextField fullWidth label="Nouveau mot de passe" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} sx={{ mb: 3, ...INPUT_SX }} />
                <Button variant="contained" type="submit" sx={{ ...BTN_SX, bgcolor: B, '&:hover': { bgcolor: '#00a884' } }}>Modifier le mot de passe</Button>
              </form>
            )}
          </Box>
        </Paper>
      </Container>
      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}

// ===================== MAIN =====================
// Force SSR to ensure React hydration works properly
export async function getServerSideProps() { return { props: {} }; }

export default function Home() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      setView(stored.is_verified ? 'dashboard' : 'pending');
      api.get('/delivery/profile/').then(({ data }) => {
        const p = data.data || data;
        setUser(p); localStorage.setItem('user', JSON.stringify(p));
        setView(p.is_verified ? 'dashboard' : 'pending');
      }).catch(() => {});
    }
    setLoading(false);
  }, []);

  const handleLogin = (u) => { setUser(u); setView(u.is_verified ? 'dashboard' : 'pending'); };
  const handleLogout = async () => { await apiLogout(); setUser(null); setView('landing'); };

  if (loading) return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: DARK }}><CircularProgress sx={{ color: B }} /></Box>;

  return (
    <>
      <Head><title>Pearl Delivery - Espace Livreur</title></Head>
      {view === 'landing' && <LandingSection onLogin={() => setView('login')} onRegister={() => setView('register')} />}
      {view === 'login' && <LoginSection onBack={() => setView('landing')} onSuccess={handleLogin} onForgot={() => setView('forgot')} onRegister={() => setView('register')} />}
      {view === 'register' && <RegisterSection onBack={() => setView('landing')} onSuccess={() => setView('pending')} onLogin={() => setView('login')} />}
      {view === 'forgot' && <ForgotSection onBack={() => setView('login')} />}
      {view === 'pending' && <PendingSection onLogout={handleLogout} />}
      {view === 'dashboard' && <DashboardSection user={user} onLogout={handleLogout} />}
    </>
  );
}
