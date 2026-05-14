// src/services/reminderExtractor.js

import { getReminderIcon } from '../utils/reminderIcons';

export function extractReminderFromResponse(aiResponse) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return null;
  }

  try {
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (!jsonMatch) {
      console.log('ℹ️ No JSON block found in response');
      return null;
    }

    let reminderJSON = jsonMatch[1].trim();
    
    // Log extracted JSON for debugging
    console.log('📝 Extracted JSON string:', reminderJSON);

    reminderJSON = reminderJSON
      .replace(/,(\s*[}\]])/g, '$1');
      // .replace(/'/g, '"') // REMOVED: This breaks strings containing apostrophes (e.g. "Emma's")

    const parsed = JSON.parse(reminderJSON);

    let reminders = [];

    if (Array.isArray(parsed)) {
      reminders = parsed;
    } else if (parsed && Array.isArray(parsed.reminders)) {
      reminders = parsed.reminders;
    } else if (parsed && typeof parsed === 'object') {
      reminders = [parsed];
    }

    reminders = reminders.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      if (!r.reminder_detected) return false;
      if (!r.what) {
        console.warn('⚠️ Reminder missing "what" field');
        return false;
      }
      return true;
    });

    if (!reminders.length) {
      console.log('ℹ️ No reminder detected in response after filtering');
      return null;
    }

    if (reminders.length === 1) {
      console.log('✅ Reminder extracted:', reminders[0]);
      return reminders[0];
    }

    console.log(`✅ Multiple reminders extracted: ${reminders.length}`);
    return reminders;

  } catch (error) {
    console.error('❌ Error parsing reminder JSON:', error);
    return null;
  }
}

/**
 * Clean AI response text (remove JSON block for display)
 * @param {string} aiResponse - Claude's full response
 * @returns {string} - Clean text without JSON
 */
export function cleanResponseText(aiResponse) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return aiResponse;
  }

  // Remove JSON block from response
  const cleanText = aiResponse.replace(/```json\s*[\s\S]*?\s*```/g, '').trim();
  
  return cleanText;
}

/**
 * Validate and format reminder data for database
 * @param {Object} reminderData - Extracted reminder
 * @param {string} userId - User ID
 * @returns {Object} - Formatted for Supabase insert
 */
export function formatReminderForDB(reminderData, userId) {
  // Safely capitalize the "what" field
  const capitalizeFirst = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const normalizeRecurrence = (raw) => {
    if (!raw || raw === 'once' || raw === 'one-time') return null;
    const v = String(raw).toLowerCase();
    if (v === 'daily' || v === 'weekdays' || v === 'weekly' || v === 'monthly') return v;
    return null;
  };
  const recurrence = normalizeRecurrence(reminderData.recurrence);
  let whenTime = reminderData.when_time || reminderData.when || null;
  let whenDate = reminderData.when_date || reminderData.date || null;
  if (recurrence) {
    whenDate = null;
  }
  const notes = (() => {
    if (reminderData.notes) return reminderData.notes;
    if (recurrence === 'weekly') {
      if (reminderData.days && Array.isArray(reminderData.days)) {
        return JSON.stringify({ days: reminderData.days });
      }
      if (reminderData.day) return reminderData.day;
    }
    if (recurrence === 'monthly' && reminderData.dayOfMonth != null) return String(reminderData.dayOfMonth);
    return null;
  })();

  const whatText = capitalizeFirst(reminderData.what);
  const reminderType = recurrence ? 'recurring' : 'one-time';
  
  // Use AI-selected icon if available, otherwise fallback to helper
  const icon = reminderData.icon || getReminderIcon(whatText, 'personal');

  // Ensure event_time and notification_time are set
  // Core principle: event_time = when event happens, notification_time = when to notify
  // If we only have one time (when_time), we use it for both
  const event_time = reminderData.event_time || whenTime || null;
  let notification_time = reminderData.notification_time || whenTime || null;

  // Calculate notification_time if offset is provided by AI
  if (event_time && reminderData.notification_offset_minutes !== undefined) {
    const offset = parseInt(reminderData.notification_offset_minutes, 10);
    if (!isNaN(offset)) {
      const [h, m] = event_time.split(':').map(Number);
      const date = new Date();
      date.setHours(h, m, 0, 0);
      date.setMinutes(date.getMinutes() - offset);
      const newH = String(date.getHours()).padStart(2, '0');
      const newM = String(date.getMinutes()).padStart(2, '0');
      // format as HH:MM or HH:MM:SS depending on input, but usually HH:MM is enough
      // keeping consistent with event_time format length if possible, but HH:MM is standard here
      notification_time = `${newH}:${newM}`;
    }
  }

  return {
    user_id: userId,
    reminder_type: reminderType,
    what: whatText,
    when_time: whenTime || null,
    event_time: event_time,
    notification_time: notification_time,
      when_date: whenDate || null,
      recurrence,
    child_name: reminderData.who || null,
    where_location: reminderData.where || null,
    notes,
    icon,
    is_completed: false,
    created_at: new Date().toISOString(),
  };
}
