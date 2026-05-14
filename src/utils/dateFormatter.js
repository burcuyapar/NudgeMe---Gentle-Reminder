// src/utils/dateFormatter.js

export function formatTime(timeString) {
  if (!timeString) return '';
  const s = String(timeString).trim();
  const low = s.toLowerCase();
  const hasAmPm = /\b(am|pm)\b/.test(low);
  console.log('[formatTime:utils] in=', s, 'hasAmPm=', hasAmPm);
  if (hasAmPm) {
    console.log('[formatTime:utils] out=', s);
    return s;
  }
  const parts = s.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parts[1].slice(0, 2) : null;
  if (Number.isNaN(h) || m == null || !/^\d{2}$/.test(m)) {
    console.log('[formatTime:utils] out=', s);
    return s;
  }
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = (h % 12) || 12;
  const out = m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
  console.log('[formatTime:utils] out=', out);
  return out;
}

/**
 * Format date to relative or short format
 * @param {string} dateString - "YYYY-MM-DD"
 * @returns {string} - "Today", "Tomorrow", or "Dec 23"
 */
function parseLocalYMD(dateString) {
  if (!dateString || typeof dateString !== 'string') return null;
  const m = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(y, mo, d);
}
export function formatDate(dateString) {
  if (!dateString) return '';
  const date = parseLocalYMD(dateString) || new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateToCheck = new Date(date);
  dateToCheck.setHours(0, 0, 0, 0);
  if (dateToCheck.getTime() === today.getTime()) {
    return 'Today';
  }
  if (dateToCheck.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }
  const daysDiff = Math.floor((dateToCheck - today) / (1000 * 60 * 60 * 24));
  if (daysDiff > 0 && daysDiff <= 7) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${daysOfWeek[dateToCheck.getDay()]}`;
  }
  return dateToCheck.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateTime(whenDate, whenTime) {
  const timePart = whenTime ? formatTime(whenTime) : '';

  if (!whenDate) {
    return timePart;
  }

  let reminderDate = parseLocalYMD(whenDate);
  if (!reminderDate) {
    reminderDate = new Date(whenDate);
    reminderDate.setHours(0, 0, 0, 0);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (reminderDate.getTime() === today.getTime()) {
    return timePart;
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (reminderDate.getTime() === tomorrow.getTime()) {
    return `Tomorrow ${timePart}`.trim();
  }

  const daysDiff = Math.floor((reminderDate - today) / (1000 * 60 * 60 * 24));
  if (daysDiff > 0 && daysDiff < 7) {
    const dayName = reminderDate.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} ${timePart}`.trim();
  }

  const datePart = reminderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${datePart} ${timePart}`.trim();
}

/**
 * Check if date is today
 * @param {string} dateString - "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isToday(dateString) {
  if (!dateString) return false;
  const date = parseLocalYMD(dateString) || new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

/**
 * Check if date is in the past
 * @param {string} dateString - "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isPast(dateString) {
  if (!dateString) return false;
  const date = parseLocalYMD(dateString) || new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * Sort reminders by date and time
 * @param {Array} reminders - Array of reminder objects
 * @returns {Array} - Sorted reminders
 */
export function sortReminders(reminders) {
  if (!reminders) return [];
  
  return [...reminders].sort((a, b) => {
    // 1. Sort by Date
    // If date is null, treat as far future (or handle as needed)
    const dateA = a.when_date ? new Date(a.when_date) : new Date('9999-12-31');
    const dateB = b.when_date ? new Date(b.when_date) : new Date('9999-12-31');
    
    // Reset time to midnight to compare dates strictly
    dateA.setHours(0, 0, 0, 0);
    dateB.setHours(0, 0, 0, 0);

    if (dateA.getTime() !== dateB.getTime()) {
      return dateA - dateB; // Ascending date
    }
    
    // 2. Sort by Time (if dates are equal)
    // If time is missing, put at end of the day ('23:59:59')
    // OR put at beginning if you prefer ('00:00')
    const timeA = a.when_time || '23:59:59';
    const timeB = b.when_time || '23:59:59';
    
    return timeA.localeCompare(timeB);
  });
}
