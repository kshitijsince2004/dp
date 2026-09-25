// Renders a { type, params } notification row (DB_SCHEMA.md §7.8: "type + params,
// rendered via i18n at read time") into { title, message } via the app's existing
// i18next dictionaries (i18n/en.json + hi.json, "notifications" section).
export function renderNotification(t, notif) {
  if (!notif?.type) {
    return { title: t('notifications.fallbackTitle'), message: '' };
  }
  const params = notif.params || {};
  const key = `notifications.${notif.type}`;
  return {
    title: t(`${key}.title`, { defaultValue: t('notifications.fallbackTitle') }),
    message: t(`${key}.message`, {
      ...params,
      comment: params.comment || t('notifications.noReason'),
      defaultValue: '',
    }),
  };
}
