import { getReminderIcon } from './reminderIcons';

/**
 * Calculates the notification time based on the event time and reminder type.
 * 
 * Rules:
 * - School drop-off/pickup: -30 minutes (or user preference)
 * - Activities: -60 minutes (or user preference)
 * - Personal/self-care:
 *   - Quick (pills, water): 0 minutes
 *   - Activities (yoga, gym): -30 minutes (or user preference)
 * 
 * @param {string} eventTime - The event time in "HH:MM" (24h) or "HH:MM AM/PM" format.
 * @param {string} reminderType - The type of reminder (e.g., 'school_dropoff', 'activity', 'personal').
 * @param {string} title - The title of the reminder (used for fallback type detection).
 * @param {object} userPreferences - User notification preferences (optional).
 * @returns {string|null} - The calculated notification time in "HH:MM:SS" format, or null if invalid.
 */
export const calculateNotificationTime = (eventTime, reminderType, title = '', userPreferences = {}) => {
  if (!eventTime) {
    console.log('⚠️ calculateNotificationTime: No eventTime provided');
    return null;
  }

  // Normalize time to HH:MM:SS format
  const timeStr = String(eventTime).trim();
  // Match HH:MM or HH:MM:SS with optional AM/PM
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  
  let hour = 0;
  let minute = 0;
  
  if (match) {
      hour = parseInt(match[1], 10);
      minute = parseInt(match[2], 10);
      const ampm = match[4] ? match[4].toLowerCase().replace(/\./g, '') : null;
      
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
  } else {
      console.log(`⚠️ calculateNotificationTime: Invalid time format '${eventTime}'`);
      return null;
  }

  let offsetMinutes = 0;
  const lowerType = (reminderType || '').toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // Keyword lists for personal reminder classification
  const quickKeywords = [
    'pill', 'medication', 'medicine', 'meds', 'med',
    'supplement', 'vitamin', 'water', 'hydrate', 'drink',
    'take', 'check'
  ];

  const activityKeywords = [
    'class', 'session', 'gym', 'workout', 'exercise',
    'yoga', 'pilates', 'stretch', 'meditation', 'mindfulness',
    'therapy', 'appointment', 'consultation', 'run', 'jog'
  ];

  // Helper to check for activities (generic list)
  const isActivity = (text) => {
    const activities = [
        'soccer', 'football', 'ballet', 'dance', 'dancing', 
        'piano', 'guitar', 'music', 'violin',
        'art', 'drawing', 'painting',
        'class', 'lesson', 'tutoring',
        'training', 'practice', 'rehearsal',
        'gymnastics', 'swimming', 'swim',
        'karate', 'judo', 'taekwondo', 'martial arts',
        'yoga', 'pilates',
        'baseball', 'basketball', 'tennis', 'volleyball', 'hockey',
        'scouts', 'club'
    ];
    return activities.some(a => text.includes(a));
  };

  // Determine offset based on rules
  if (lowerType.includes('school') || lowerTitle.includes('school') || lowerTitle.includes('drop-off') || lowerTitle.includes('pickup')) {
      offsetMinutes = userPreferences?.schoolMinutesBefore ?? 30;
  } else if (lowerType.includes('activity') || lowerType.includes('sport') || (reminderType !== 'personal' && isActivity(lowerTitle))) {
      offsetMinutes = userPreferences?.activityMinutesBefore ?? 60;
  } else if (lowerType.includes('personal') || lowerType.includes('self-care') || lowerType === 'personal') {
      // Personal Reminder Classification
      const isQuick = quickKeywords.some(k => lowerTitle.includes(k));
      const isPersonalActivity = activityKeywords.some(k => lowerTitle.includes(k));

      if (isPersonalActivity) {
          // Prioritize activity if keywords match (e.g. "Meditation" contains "med", but is an activity)
          offsetMinutes = userPreferences?.personalActivityOffset ?? 30;
          console.log(`🔍 Classified '${title}' as Personal Activity (${offsetMinutes}m)`);
      } else if (isQuick) {
          offsetMinutes = 0; // Always 0 for quick tasks
          console.log(`🔍 Classified '${title}' as Quick Personal Reminder (0m)`);
      } else {
          // Default to activity/self-care if ambiguous
          offsetMinutes = userPreferences?.personalActivityOffset ?? 30;
          console.log(`🔍 Classified '${title}' as Personal Activity (Default - ${offsetMinutes}m)`);
      }
  } else {
     // Fallback logic for generic types (recurring/one-time)
     
     // Check for personal/self-care keywords
     const isQuick = quickKeywords.some(k => lowerTitle.includes(k));
     const isPersonalActivity = activityKeywords.some(k => lowerTitle.includes(k));

     if (lowerTitle.includes('school')) {
         offsetMinutes = userPreferences?.schoolMinutesBefore ?? 30;
     } else if (isQuick) {
         offsetMinutes = 0;
         console.log(`🔍 Classified '${title}' as Quick Reminder (Generic Flow - 0m)`);
     } else if (isPersonalActivity) {
         offsetMinutes = userPreferences?.personalActivityOffset ?? 30;
         console.log(`🔍 Classified '${title}' as Personal Activity (Generic Flow - ${offsetMinutes}m)`);
     } else if (isActivity(lowerTitle)) {
         offsetMinutes = userPreferences?.activityMinutesBefore ?? 60;
     } else {
         // Default to 0 for unknown/generic types
         offsetMinutes = 0;
     }
  }

  // Calculate new time
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setMinutes(date.getMinutes() - offsetMinutes);

  const newHour = String(date.getHours()).padStart(2, '0');
  const newMinute = String(date.getMinutes()).padStart(2, '0');
  const notificationTime = `${newHour}:${newMinute}:00`;

  console.log(`🕒 Time Calc: Event '${eventTime}' (${reminderType}/${title}) - ${offsetMinutes}m = Notif '${notificationTime}'`);
  return notificationTime;
};
