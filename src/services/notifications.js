import * as Notifications from 'expo-notifications';
import { formatTime } from '../utils/dateFormatter';
import { getReminderIcon } from '../utils/reminderIcons';
import { capitalizeFirstLetter } from '../utils/textUtils';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper to check if a string is a valid ISO date (YYYY-MM-DD)
function isValidDateString(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

export async function requestNotificationPermission() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const result = await Notifications.requestPermissionsAsync();
  return result.granted || result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('✅ All notifications cleared (cancelAllNotifications)');
  } catch (error) {
    console.error('❌ Error clearing notifications:', error);
  }
}

export async function clearAllNotifications() { 
  await cancelAllNotifications();
}

export async function cancelSingleNotification(identifier) {
  if (!identifier) {
    console.warn('Cannot cancel notification - null ID');
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    console.log(`🗑️ Canceled notification: ${identifier}`);
  } catch (error) {
    console.warn(`⚠️ Failed to cancel notification ${identifier}:`, error?.message);
  }
}

export async function cleanupOrphanedNotifications(activeReminders) {
  try {
    console.log('🧹 Starting orphaned notification cleanup...');
    const scheduledNotifs = await Notifications.getAllScheduledNotificationsAsync();
    
    if (scheduledNotifs.length === 0) {
      console.log('✅ No scheduled notifications to check.');
      return;
    }

    // Skip reminders with null notification_id to avoid false positives/negatives during comparison
    // although activeReminders here serves as the "source of truth" for existence.
    // If a reminder has null notification_id, it still exists.
    // But if we want to be safe as requested:
    const validReminders = activeReminders.filter(r => r.notification_id !== null);
    const nullCount = activeReminders.length - validReminders.length;
    if (nullCount > 0) {
        console.log(`⚠️ Skipped ${nullCount} active reminders with NULL notification_id during cleanup check.`);
    }

    const activeReminderIds = new Set(activeReminders.map(r => r.id));
    let canceledCount = 0;

    for (const notif of scheduledNotifs) {
      const reminderId = notif.content?.data?.reminderId;
      
      // If notification has a reminderId but that reminder is not active, cancel it
      if (reminderId && !activeReminderIds.has(reminderId)) {
        console.log(`🗑️ Found orphaned notification for deleted reminder ${reminderId} (Notif ID: ${notif.identifier}). Canceling...`);
        await cancelSingleNotification(notif.identifier);
        canceledCount++;
      } 
      // Optional: If you want to be strict and cancel ANY notification without a reminderId
      // else if (!reminderId && !notif.content?.data?.type === 'test') { ... }
    }

    if (canceledCount > 0) {
      console.log(`✅ Cleanup complete. Canceled ${canceledCount} orphaned notifications.`);
    } else {
      console.log('✅ Cleanup complete. No orphaned notifications found.');
    }
  } catch (error) {
    console.error('❌ Error cleaning up orphaned notifications:', error);
  }
}

export async function checkScheduledNotifications() { 
  try { 
    const scheduledNotifs = await Notifications.getAllScheduledNotificationsAsync(); 
    console.log('📊 Total scheduled notifications:', scheduledNotifs.length); 
    
    if (scheduledNotifs.length === 0) { 
      console.log('⚠️ No notifications are currently scheduled'); 
      return; 
    } 
    
    scheduledNotifs.forEach((notif, index) => { 
      console.log(`\n--- Notification ${index + 1} ---`); 
      console.log('ID:', notif.identifier); 
      console.log('Title:', notif.content?.title); 
      console.log('Body:', notif.content?.body); 
      console.log('Trigger:', notif.trigger); 
      console.log('Data:', notif.content?.data); 
    }); 
    
    return scheduledNotifs; 
  } catch (error) { 
    console.error('❌ Error checking scheduled notifications:', error); 
    return null; 
  } 
}

export async function checkNotificationPermissions() {
  try {
    const settings = await Notifications.getPermissionsAsync();
    console.log('� Notification permissions:', JSON.stringify(settings, null, 2));
    return settings;
  } catch (e) {
    console.error('❌ Error checking notification permissions (debug):', e);
    return null;
  }
}

export async function scheduleTestNotification() {
  const now = new Date();
  const triggerTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes from now
  
  console.log('🧪 Scheduling TEST notification for:', triggerTime.toLocaleString());
  
  const content = {
    title: '🧪 Test Notification',
    body: 'If you see this, notifications are working!',
    data: { type: 'test' },
    sound: true,
  };
  
  const trigger = {
    type: 'date',
    date: triggerTime,
  };
  
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger,
    });
    console.log('✅ Test notification scheduled with ID:', id);
    alert(`Test notification scheduled for ${triggerTime.toLocaleTimeString()}`);
    return id;
  } catch (e) {
    console.error('❌ Failed to schedule test notification:', e);
    alert('Failed to schedule test notification');
    return null;
  }
}

export async function rescheduleAllReminders(reminders) { 
  console.log('🔄 Rescheduling all reminders...'); 
  console.log('📋 Total reminders to schedule:', reminders.length); 
  
  let successCount = 0; 
  let failCount = 0; 
  
  for (const reminder of reminders) { 
    try { 
      // Skip completed reminders 
      if (reminder.is_completed) { 
        console.log(`⏭️ Skipping completed: ${reminder.what}`); 
        continue; 
      } 
      
      // Skip if no notification_time 
      if (!reminder.notification_time) { 
        console.log(`⚠️ No notification_time for: ${reminder.what}`); 
        continue; 
      } 
      
      // Cancel previously scheduled notifications for this reminder (DB stored IDs or runtime duplicates)
      if (reminder.notification_id) {
        const ids = String(reminder.notification_id).split(',').map(s => s.trim()).filter(Boolean);
        for (const oldId of ids) {
          await cancelSingleNotification(oldId);
        }
      }
      // Also ensure no runtime duplicates with same reminderId
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const dupes = scheduled.filter(n => n?.content?.data?.reminderId === reminder.id);
        for (const d of dupes) {
          await cancelSingleNotification(d.identifier);
        }
      } catch (e) {
        console.warn('⚠️ Could not inspect runtime scheduled notifications:', e?.message);
      }

      console.log(`📅 Scheduling: ${reminder.what} at ${reminder.notification_time}`); 
      const notificationId = await scheduleReminderNotification(reminder); 
      
      if (notificationId) { 
        successCount++; 
        console.log(`✅ Scheduled ${reminder.what}, ID: ${notificationId}`); 
        
        // Update the notification_id in database 
        const { error } = await supabase 
          .from('reminders') 
          .update({ notification_id: notificationId }) 
          .eq('id', reminder.id); 
          
        if (error) { 
          console.error('❌ Failed to update notification_id:', error); 
        } 
      } 
    } catch (error) { 
      failCount++; 
      console.error(`❌ Failed to schedule ${reminder.what}:`, error); 
    } 
  } 
  
  console.log(`\n📊 Scheduling complete: ${successCount} success, ${failCount} failed`); 
  return { successCount, failCount }; 
}

function parseHM(hhmm) {
  if (!hhmm) return { hour: 9, minute: 0 };
  const parts = hhmm.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] || '0');
  return { hour: h, minute: m };
}

function getWeekdayNumber(dayName) {
  if (!dayName || typeof dayName !== 'string') return null;
  const key = dayName.trim().toLowerCase();
  const map = {
    sunday: 1,
    monday: 2,
    tuesday: 3,
    wednesday: 4,
    thursday: 5,
    friday: 6,
    saturday: 7,
  };
  return map[key] || null;
}

export async function scheduleReminderNotification(reminder) {
  // Use provided icon or fallback to getReminderIcon
  const icon = reminder.icon || getReminderIcon(reminder.what, reminder.reminder_type);
  const name = (reminder.child_name || '').trim();
  // Display uses event_time (when it happens), fallback to when_time
  const displayTime = reminder.event_time || reminder.when_time || null;
  const timeText = displayTime ? formatTime(displayTime) : '';
  const recurrence = reminder.recurrence || null;
  const isSchool =
    reminder.reminder_type === 'school_dropoff' ||
    reminder.reminder_type === 'school_pickup';

  // Duplicate prevention: cancel any scheduled notifications that already reference this reminder.id
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      // Only match by reminderId in data payload, ignoring experienceId or other metadata
      const duplicates = scheduled.filter(n => n?.content?.data?.reminderId === reminder.id);
      
      if (duplicates.length > 0) {
        console.log(`⚠️ Found ${duplicates.length} existing notifications for reminder ${reminder.id} (${reminder.what}). Canceling them...`);
        for (const d of duplicates) {
          await cancelSingleNotification(d.identifier);
        }
        // Wait a tiny bit to ensure cancellation propagates
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e) {
      console.warn('⚠️ Could not inspect scheduled notifications for duplicates:', e?.message);
    }

  console.log('🔔 SCHEDULING (entry):', {
    id: reminder.id,
    what: reminder.what,
    when_date: reminder.when_date,
    event_time: reminder.event_time,
    notification_time: reminder.notification_time,
    when_time: reminder.when_time,
    recurrence,
  });

  try {
    const { status, granted, canAskAgain } = await Notifications.getPermissionsAsync();
    console.log('📱 Notification permission status:', { status, granted, canAskAgain });
  } catch (e) {
    console.error('❌ Error checking notification permissions:', e);
  }

  // New Title Format: [Icon] [Reminder Text]
  const title = `${icon} ${capitalizeFirstLetter(reminder.what)}`;

  // New Body Format based on type
  let body = '';
  
  if (reminder.reminder_type === 'school_dropoff') {
    body = capitalizeFirstLetter(`Time to get ${name || 'the kids'} ready for school`);
  } else if (reminder.reminder_type === 'school_pickup') {
    body = capitalizeFirstLetter(`Time to pick up ${name || 'the kids'} from school`);
  } else if (reminder.reminder_type === 'activity') {
    body = capitalizeFirstLetter(`Get ready for ${reminder.what}${timeText ? ` at ${timeText}` : ''}`);
  } else if (reminder.reminder_type === 'personal') {
    body = capitalizeFirstLetter(`Your reminder${timeText ? ` for ${timeText}` : ''}`);
  } else {
    // Default / Recurring Logic
    if (recurrence === 'daily') {
      body = 'Daily reminder';
    } else if (recurrence === 'weekly') {
      const day = reminder.notes || 'Weekly';
      body = capitalizeFirstLetter(`${day} reminder`);
    } else if (recurrence === 'monthly') {
      body = 'Monthly reminder';
    } else {
      body = capitalizeFirstLetter(timeText ? `Reminder for ${timeText}` : 'Reminder');
    }
  }
  const dateStr = reminder.when_date;
  // Trigger uses notification_time (when to fire), fallback to when_time
  const timeSource = reminder.notification_time || reminder.when_time || null;
  const { hour, minute } = parseHM(timeSource);

  // Special handling: school reminders should only fire on weekdays (Mon–Fri)
  if (isSchool && (recurrence === 'daily' || recurrence === 'weekdays')) {
    const weekdayNumbers = [2, 3, 4, 5, 6]; // Monday–Friday (Expo: 1 = Sunday)
    const now = new Date();
    const ids = [];

    console.log('🏫 Scheduling weekday-only school notifications (Mon–Fri)', {
      id: reminder.id,
      what: reminder.what,
      hour,
      minute,
      weekdayNumbers,
    });

    for (const weekday of weekdayNumbers) {
      const trigger = { type: 'weekly', weekday, hour, minute, repeats: true };
      console.log('🔔 Scheduling school notification for weekday:', {
        reminderId: reminder.id,
        weekday,
        trigger,
      });
      try {
        console.log('🚀 Calling scheduleNotificationAsync (School/Weekday) with:', {
          content: {
            title,
            body,
            data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence: 'weekdays' },
          },
          trigger,
        });
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence: 'weekdays' },
          },
          trigger,
        });
        console.log('✅ School/Weekday Notification scheduled successfully. ID:', id);
        ids.push(id);
      } catch (e) {
        console.error('❌ Error scheduling school/weekday notification:', e);
      }
    }

    const joinedIds = ids.join(',');
    console.log('✅ Scheduled weekday-only school notifications ids:', joinedIds);
    console.log('⏰ Current time:', now.toLocaleString());
    return ids.length > 0 ? joinedIds : null;
  }

  let trigger;
  if (recurrence === 'daily' || recurrence === 'weekdays') {
    trigger = { type: 'daily', hour, minute, repeats: true };
  } else if (recurrence === 'weekly') {
    let days = [];
    const rawNotes = reminder.notes || null;
    
    // Try parsing as JSON first (new multi-day format)
    try {
      if (rawNotes && rawNotes.startsWith('{')) {
        const parsed = JSON.parse(rawNotes);
        if (parsed.days && Array.isArray(parsed.days)) {
          days = parsed.days;
        }
      }
    } catch (e) {
      // Not JSON, ignore
    }

    // Fallback to legacy string format or single day
    if (days.length === 0 && typeof rawNotes === 'string' && rawNotes.length > 0) {
      const weekday = getWeekdayNumber(rawNotes);
      if (weekday) days.push(weekday); // 1-7 format from getWeekdayNumber
    }

    // If still no days, default to current day
    if (days.length === 0) {
      const base = dateStr ? new Date(dateStr) : new Date();
      days.push(base.getDay() + 1); // Expo 1=Sun
    }
    
    // Schedule for each day
    const ids = [];
    console.log('📅 Scheduling weekly notification for days:', days);
    
    for (const d of days) {
      // If d is 0-6 (standard JS), map to 1-7 (Expo)
      // If d is 1-7 (Expo/legacy), keep it.
      // Wait, getWeekdayNumber returns 1-7 (Sun=1).
      // My new UI uses 0-6 (Sun=0).
      // So I need to normalize.
      
      let expoWeekday = d;
      // Heuristic: if d is 0, it's Sunday (Expo 1).
      // If d comes from UI (0-6), we need to map to 1-7.
      // 0->1, 1->2 ... 6->7.
      // But wait, getWeekdayNumber returns 1-7.
      // So if I have mixed sources, I need to be careful.
      // Let's assume days from JSON are 0-6 (JS standard).
      // And legacy string returns 1-7.
      
      // Let's standardise on Expo 1-7 for the loop.
      if (rawNotes && rawNotes.startsWith('{')) {
         // It's from my new UI (0-6)
         expoWeekday = d + 1;
      }
      
      const trigger = { type: 'weekly', weekday: expoWeekday, hour, minute, repeats: true };
      console.log('🔔 Scheduling weekly for day:', expoWeekday);
      
      try {
        console.log('🚀 Calling scheduleNotificationAsync (Weekly) with:', {
          content: { 
              title, 
              body, 
              data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence: 'weekly', dayIndex: d } 
          },
          trigger,
        });
        const id = await Notifications.scheduleNotificationAsync({
          content: { 
              title, 
              body, 
              data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence: 'weekly', dayIndex: d } 
          },
          trigger,
        });
        console.log('✅ Weekly Notification scheduled successfully. ID:', id);
        ids.push(id);
      } catch (e) {
        console.error('❌ Error scheduling weekly notification:', e);
      }
    }
    const joinedIds = ids.join(',');
    return ids.length > 0 ? joinedIds : null;
  } else if (recurrence === 'monthly') {
    // Monthly trigger
    // We need a day of the month.
    // If when_date is provided, use that day.
    // Otherwise use today's day.
    let day = new Date().getDate();
    if (dateStr && isValidDateString(dateStr)) {
        const parts = dateStr.split('-').map(Number);
        if (parts.length === 3) day = parts[2];
    }
    
    // Expo uses 1-31 for day
    const trigger = { type: 'monthly', day, hour, minute, repeats: true };
    console.log('🔔 Scheduling monthly notification:', {
        reminderId: reminder.id,
        day,
        hour,
        minute
    });

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: { 
                title, 
                body, 
                data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence: 'monthly' } 
            },
            trigger,
        });
        console.log('✅ Monthly Notification scheduled successfully. ID:', id);
        return id;
    } catch (e) {
        console.error('❌ Error scheduling monthly notification:', e);
        return null;
    }
  } else {
    // One-time notification
    // Use trigger date logic
    if (!dateStr) {
      // If no date provided, assume it's for TODAY or TOMORROW based on time
      const now = new Date();
      let date = new Date();
      date.setHours(hour, minute, 0, 0);

      if (date <= now) {
         // If time passed today, schedule for tomorrow
         date.setDate(date.getDate() + 1);
      }
      trigger = { type: 'date', date }; // Use date trigger for one-time
    } else {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, (m || 1) - 1, d || 1, hour, minute, 0, 0);
      trigger = { type: 'date', date };
    }
  }
  
  const now = new Date();
  let triggerDate = null;
  if (trigger && trigger.type === 'date' && trigger.date instanceof Date) {
    triggerDate = trigger.date;
  }
  console.log('🔔 Scheduling notification for:', {
    id: reminder.id,
    what: reminder.what,
    when_date: reminder.when_date,
    event_time: reminder.event_time,
    notification_time: reminder.notification_time,
    when_time: reminder.when_time,
    recurrence,
    trigger,
  });
  console.log('⏰ Current time:', now.toLocaleString());
  if (triggerDate) {
    console.log('🎯 Trigger time:', triggerDate.toLocaleString());
    console.log('⚠️ Trigger in past?', triggerDate < new Date());
    
    // Fix 1: Detect and Handle Past Notification Times
    if (triggerDate <= new Date()) {
      console.warn('⚠️ Notification time is in the past, skipping schedule...');
      console.error('❌ One-time reminder scheduled in past:', {
        event_time: reminder.event_time,
        notification_time: reminder.notification_time,
        trigger_date: triggerDate,
        current_time: new Date()
      });
      return null;
    }
  } else {
    console.log('🎯 Trigger is non-date configuration (daily/weekly/interval):', trigger);
  }
  
  try {
    console.log('🚀 Calling scheduleNotificationAsync (General) with:', {
      content: { title, body, data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence } },
      trigger,
    });
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { reminderId: reminder.id, reminderType: reminder.reminder_type, recurrence } },
      trigger,
    });
    console.log('Scheduled notification id:', id);
    console.log('✅ General Notification scheduled successfully. ID:', id);
    return id;
  } catch (e) {
    console.error('❌ Error scheduling general notification:', e);
    return null;
  }
}

// Diagnostic: group scheduled notifications by reminderId and log duplicates
export async function checkForDuplicates() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  console.log('📊 Total notifications:', scheduled.length);
  const grouped = {};
  scheduled.forEach(notif => {
    const reminderId = notif?.content?.data?.reminderId;
    if (!grouped[reminderId || 'null']) grouped[reminderId || 'null'] = [];
    grouped[reminderId || 'null'].push(notif.identifier);
  });
  Object.entries(grouped).forEach(([reminderId, ids]) => {
    if (reminderId !== 'null' && ids.length > 1) {
      console.log(`⚠️ DUPLICATE: Reminder ${reminderId} has ${ids.length} notifications:`, ids);
    }
  });
  return grouped;
}

// Utility: cancel extra notifications for the same reminderId (keep the first)
export async function dedupeScheduledByReminderId() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const seen = new Set();
  let canceled = 0;
  for (const notif of scheduled) {
    const rId = notif?.content?.data?.reminderId;
    if (!rId) continue;
    if (seen.has(rId)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        canceled++;
        console.log('🗑️ Canceled duplicate scheduled notification:', notif.identifier, 'for reminderId:', rId);
      } catch (e) {
        console.warn('⚠️ Failed to cancel duplicate:', notif.identifier, e?.message);
      }
    } else {
      seen.add(rId);
    }
  }
  console.log(`✅ Dedupe complete. Canceled ${canceled} duplicate notifications.`);
  return canceled;
}

// Database duplicate check: fetch reminders and report duplicates by notification_id
export async function checkDbDuplicates(userId) {
  try {
    const { data, error } = await supabase
      .from('reminders')
      .select('id, what, reminder_type, notification_time, notification_id, recurrence')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .order('notification_time', { ascending: true });
    if (error) {
      console.error('❌ DB check error:', error);
      return null;
    }
    console.log('📋 Fetched reminders for duplicate check:', data?.length || 0);
    const byNotifId = {};
    for (const r of data || []) {
      const key = r.notification_id || 'null';
      if (!byNotifId[key]) byNotifId[key] = [];
      byNotifId[key].push(r.id);
    }
    Object.entries(byNotifId).forEach(([nid, ids]) => {
      if (nid !== 'null' && ids.length > 1) {
        console.log(`⚠️ DB DUPLICATE: notification_id ${nid} referenced by reminders:`, ids);
      }
    });
    return byNotifId;
  } catch (e) {
    console.error('❌ Error running DB duplicate check:', e);
    return null;
  }
}

/**
 * Fetch user notification preferences from Supabase
 * @returns {Promise<object>}
 */
export async function getUserNotificationPreferences() {
  try {
    // Try to get user ID from AsyncStorage first (faster)
    let userId = await AsyncStorage.getItem('user_id');
    
    // Fallback to Supabase Auth
    if (!userId) {
       const { data } = await supabase.auth.getUser();
       userId = data?.user?.id;
    }

    if (!userId) return {};

    const { data, error } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('user_id', userId)
      .single();

    if (error) {
        // Silent fail for preferences, return defaults
        return {};
    }

    return data?.notification_preferences || {};
  } catch (e) {
    console.error('Error fetching user notification preferences:', e);
    return {};
  }
}


export async function rescheduleAllNotifications() {
  console.log('🔄 STARTING RESCHEDULE ALL...');
  
  // 1. Get current user
  let userId = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id;
    if (!userId) {
        userId = await AsyncStorage.getItem('user_id');
    }
  } catch (e) {
    console.error('Error getting user ID:', e);
    return 0;
  }

  if (!userId) {
    console.error('❌ No user ID found, cannot reschedule.');
    return 0;
  }

  // 2. Fetch all reminders
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('❌ Error fetching reminders:', error);
    return 0;
  }

  console.log(`📋 Found ${reminders.length} reminders in DB. Rescheduling...`);

  // 3. Clear all existing
  await Notifications.cancelAllScheduledNotificationsAsync();
  console.log('🗑️ Cleared all existing notifications.');

  // 4. Schedule each one
  let count = 0;
  let skippedCount = 0;
  const now = new Date();

  for (const reminder of reminders) {
    try {
      let eventDate = new Date(NaN);
      if (!reminder.recurrence && reminder.when_date) {
        // Check past based on event_time (actual event)
        const t = reminder.event_time || reminder.when_time || '09:00:00';
        eventDate = new Date(`${reminder.when_date}T${t}`);
      }

      if (!isNaN(eventDate.getTime()) && eventDate < now) {
        // Mark as completed in database (soft delete)
        await supabase 
          .from('reminders') 
          .update({ is_completed: true }) 
          .eq('id', reminder.id); 
        
        console.log(`✓ Auto-completed past reminder: ${reminder.what}`);
        skippedCount++;
        continue; 
      }

      const notifId = await scheduleReminderNotification(reminder);
      if (notifId) {
        // Update DB with new ID
        await supabase
          .from('reminders')
          .update({ notification_id: notifId })
          .eq('id', reminder.id);
        count++;
      }
    } catch (e) {
      console.error(`❌ Failed to reschedule reminder ${reminder.id}:`, e);
    }
  }

  console.log(`✅ Successfully rescheduled ${count}/${reminders.length} notifications (${skippedCount} auto-completed past reminders).`);
  return count;
}

export const autocompletePastReminders = async (userId) => {
  try {
    const now = new Date();
    
    // Get all one-time reminders with past dates
    const { data: pastReminders } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .is('recurrence', null) // one-time only
      .not('when_date', 'is', null)
      .eq('is_completed', false);
    
    if (!pastReminders || pastReminders.length === 0) return;
    
    // Mark past ones as completed
    for (const reminder of pastReminders) {
      // when_date is usually YYYY-MM-DD
      // Check past based on event_time (actual event)
      const timeStr = reminder.event_time || reminder.when_time || '23:59:00';
      const eventDate = new Date(reminder.when_date + 'T' + timeStr);
      
      if (eventDate < now) {
        console.log('✓ Auto-completing past reminder:', reminder.what);
        await supabase
          .from('reminders')
          .update({ is_completed: true })
          .eq('id', reminder.id);
      }
    }
  } catch (err) {
    console.error('Error auto-completing past reminders:', err);
  }
};
