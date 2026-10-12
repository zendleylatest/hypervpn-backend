import { DateTime } from 'luxon';
import Reminder from '../models/Reminder.js';
import User from '../models/User.js';
import { getMessaging } from '../utils/firebaseAdminInit.js';

const TICK_MS = 60 * 1000;

/** Set REMINDER_PUSH_DEBUG=1 for per-reminder evaluation logs (noisy). */
const REMINDER_PUSH_DEBUG =
  process.env.REMINDER_PUSH_DEBUG === '1' || process.env.REMINDER_PUSH_DEBUG === 'true';

/** Set REMINDER_PUSH_TICK_LOG=1 to log every scheduler tick (enabled count + UTC time). */
const REMINDER_PUSH_TICK_LOG =
  process.env.REMINDER_PUSH_TICK_LOG === '1' || process.env.REMINDER_PUSH_TICK_LOG === 'true';

function maskToken(t) {
  if (!t || typeof t !== 'string') return '(none)';
  if (t.length <= 12) return `${t.slice(0, 4)}…`;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

function typeLabel(type) {
  const map = {
    meal: 'Meal',
    medication: 'Medication',
    water: 'Water',
    exercise: 'Exercise',
    appointment: 'Appointment',
  };
  return map[type] || 'Reminder';
}

/** Model: 0=Sun .. 6=Sat. Luxon: Mon=1 .. Sun=7 */
function toModelDayOfWeek(luxonWeekday) {
  return luxonWeekday === 7 ? 0 : luxonWeekday;
}

function dayMatchesFrequency(reminder, modelDow) {
  const f = reminder.frequency;
  if (f === 'daily') return true;
  if (f === 'weekdays') return modelDow >= 1 && modelDow <= 5;
  if (f === 'weekends') return modelDow === 0 || modelDow === 6;
  if (f === 'weekly' || f === 'custom') {
    const days = reminder.daysOfWeek || [];
    return days.includes(modelDow);
  }
  return true;
}

function shouldFireNow(reminder, local) {
  const parts = reminder.time.split(':');
  const rh = parseInt(parts[0], 10);
  const rm = parseInt(parts[1], 10);
  if (local.hour !== rh || local.minute !== rm) return false;
  const modelDow = toModelDayOfWeek(local.weekday);
  return dayMatchesFrequency(reminder, modelDow);
}

async function sendReminderPush(reminder, user) {
  const messaging = getMessaging();
  if (!messaging) {
    console.warn('[reminderPush] send skipped: Firebase messaging not initialized (check credentials)');
    return;
  }

  const tokens = (user.deviceTokens || [])
    .map((dt) => dt?.token)
    .filter(Boolean);
  if (tokens.length === 0) {
    console.warn('[reminderPush] send skipped: no FCM tokens', {
      userId: String(user._id),
      reminderId: String(reminder._id),
      deviceTokensLength: (user.deviceTokens || []).length,
    });
    return;
  }

  const title = reminder.title || 'Reminder';
  const body = `${typeLabel(reminder.type)} — ${reminder.time}`;

  console.log('[reminderPush] sending FCM', {
    reminderId: String(reminder._id),
    userId: String(user._id),
    tokenCount: tokens.length,
    tokensPreview: tokens.map(maskToken),
  });

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    try {
      const response = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: {
          type: 'reminder',
          reminderId: String(reminder._id),
          reminderTitle: String(title),
        },
        tokens: chunk,
      });
      console.log('[reminderPush] FCM multicast result', {
        reminderId: String(reminder._id),
        userId: String(user._id),
        successCount: response.successCount,
        failureCount: response.failureCount,
      });
      if (response.responses?.length) {
        response.responses.forEach((r, idx) => {
          if (!r.success) {
            console.warn('[reminderPush] FCM token failed', {
              reminderId: String(reminder._id),
              index: idx,
              token: maskToken(chunk[idx]),
              code: r.error?.code,
              message: r.error?.message,
            });
          }
        });
      }
    } catch (err) {
      console.error('[reminderPush] FCM sendEachForMulticast threw:', err.message, err.stack);
    }
  }

  reminder.lastTriggered = new Date();
  await reminder.save();
  console.log('[reminderPush] lastTriggered updated', {
    reminderId: String(reminder._id),
    at: reminder.lastTriggered.toISOString(),
  });
}

let intervalId = null;

async function runReminderPushTick() {
  try {
    const reminders = await Reminder.find({ enabled: true });
    const utcIso = new Date().toISOString();
    if (REMINDER_PUSH_TICK_LOG || REMINDER_PUSH_DEBUG) {
      console.log('[reminderPush] tick', {
        enabledReminderCount: reminders.length,
        utcIso,
      });
    }

    let fired = 0;
    const userCache = new Map();

    for (const reminder of reminders) {
      const tz = reminder.timezone || 'UTC';
      let local;
      let usedFallback = false;
      try {
        local = DateTime.now().setZone(tz);
        if (!local.isValid) {
          usedFallback = true;
          local = DateTime.now().setZone('UTC');
        }
      } catch {
        usedFallback = true;
        local = DateTime.now().setZone('UTC');
      }
      if (usedFallback) {
        console.warn('[reminderPush] invalid timezone, using UTC', {
          reminderId: String(reminder._id),
          storedTimezone: tz,
        });
      }

      const fire = shouldFireNow(reminder, local);
      if (REMINDER_PUSH_DEBUG) {
        const modelDow = toModelDayOfWeek(local.weekday);
        console.log('[reminderPush] evaluate', {
          reminderId: String(reminder._id),
          userId: String(reminder.userId),
          tz,
          localWall: local.toFormat('yyyy-MM-dd HH:mm:ss ZZZZ'),
          localHour: local.hour,
          localMinute: local.minute,
          reminderTime: reminder.time,
          frequency: reminder.frequency,
          modelDow,
          daysOfWeek: reminder.daysOfWeek,
          dayMatches: dayMatchesFrequency(reminder, modelDow),
          shouldFireNow: fire,
        });
      }

      if (!fire) continue;

      if (reminder.lastTriggered) {
        const ms = Date.now() - new Date(reminder.lastTriggered).getTime();
        if (ms < 50000) {
          if (REMINDER_PUSH_DEBUG) {
            console.log('[reminderPush] skip cooldown (~50s)', {
              reminderId: String(reminder._id),
              msSinceLastTriggered: ms,
            });
          }
          continue;
        }
      }

      let user = userCache.get(String(reminder.userId));
      if (!user) {
        user = await User.findById(reminder.userId).select('deviceTokens');
        if (!user) {
          console.warn('[reminderPush] user missing for reminder; skip', {
            reminderId: String(reminder._id),
            userId: String(reminder.userId),
          });
          continue;
        }
        userCache.set(String(reminder.userId), user);
      }

      console.log('[reminderPush] firing', {
        reminderId: String(reminder._id),
        userId: String(user._id),
        title: reminder.title,
        type: reminder.type,
        tz,
        localWall: local.toFormat('yyyy-MM-dd HH:mm'),
      });
      await sendReminderPush(reminder, user);
      fired += 1;
    }

    if (fired > 0) {
      console.log('[reminderPush] tick done', { fired, checked: reminders.length });
    }
  } catch (e) {
    console.error('[reminderPush] tick error:', e?.message, e?.stack);
  }
}

export function startReminderPushScheduler() {
  if (intervalId) return;

  const messagingOk = !!getMessaging();
  console.log('[reminderPush] scheduler starting', {
    tickMs: TICK_MS,
    fcmReady: messagingOk,
    verboseDebug: REMINDER_PUSH_DEBUG,
    tickLogEachMinute: REMINDER_PUSH_TICK_LOG || REMINDER_PUSH_DEBUG,
    immediateFirstTick: true,
  });

  void runReminderPushTick();
  intervalId = setInterval(() => {
    void runReminderPushTick();
  }, TICK_MS);
}
