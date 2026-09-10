import { formatDayMonth } from './i18nFormat';

// Libellé traduit d'un statut de versement renvoyé par le backend.
// Statut vide = versement pas encore finalisé (ancien repli « En cours »).
// Un statut inconnu reste affiché tel quel plutôt que masqué.
export function payoutStatusLabel(status, t) {
  switch (String(status || '').toLowerCase()) {
    case '':
    case 'processing':
    case 'in_transit':
    case 'in_progress':
      return t('inProgress');
    case 'paid':
    case 'completed':
    case 'succeeded':
      return t('paid');
    case 'pending':
      return t('payoutStatusPending');
    case 'failed':
    case 'canceled':
    case 'cancelled':
      return t('payoutStatusFailed');
    default:
      return status;
  }
}

// « Initié : 3 sept » dans la langue courante, depuis la date brute du backend.
export function payoutDateLabel(versement, t) {
  if (versement?.createdAtRaw) return t('initiatedOn', { date: formatDayMonth(versement.createdAtRaw) });
  return versement?.date || '';
}
