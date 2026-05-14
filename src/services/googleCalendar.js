import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useEffect } from 'react';
import { CONFIG } from '../constants/config';
import { supabase } from './supabase';
import { getNextOccurrence } from '../utils/dateHelpers';
import { getReminderIcon } from '../utils/reminderIcons';
import { scheduleReminderNotification } from './notifications';
import { getCurrentUserId } from './familyService';

WebBrowser.maybeCompleteAuthSession();

export const useGoogleAuth = () => {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: CONFIG.GOOGLE_CALENDAR_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    redirectUri: makeRedirectUri({
      useProxy: true,
      scheme: 'nudgeme'
    }),
  });

  useEffect(() => {
    if (request) {
      console.log('OAuth Config:', {
        clientId: CONFIG.GOOGLE_CALENDAR_CLIENT_ID,
        redirectUri: request.redirectUri,
        scopes: request.scopes,
        url: request.url
      });
    }
  }, [request]);

  return { request, response, promptAsync };
};

export const fetchCalendarEvents = async (accessToken) => {
  try {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    // singleEvents=false to see 'recurrence' field as requested
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${nextWeek.toISOString()}&singleEvents=false&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
};

export const importEventsToNudgeMe = async (events) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User not found');

    const importedCount = 0;
    const errors = [];
    const createdReminders = [];

    // Filter events
    const validEvents = events.filter(event => {
      // Skip if canceled
      if (event.status === 'cancelled') return false;
      // Skip recurring events (recurrence field present)
      if (event.recurrence && event.recurrence.length > 0) return false;
      return true;
    });

    for (const event of validEvents) {
      try {
        const summary = event.summary || 'Untitled Event';
        
        // Calculate times
        let eventDate;
        let eventTimeStr; // HH:MM:SS
        let notificationTimeStr;

        if (event.start.dateTime) {
          const start = new Date(event.start.dateTime);
          eventDate = start.toISOString().split('T')[0];
          
          // event_time (HH:MM:SS) = actual event time
          const eh = String(start.getHours()).padStart(2, '0');
          const em = String(start.getMinutes()).padStart(2, '0');
          eventTimeStr = `${eh}:${em}:00`;

          // 1 hour before
          const notify = new Date(start.getTime() - 60 * 60 * 1000);
          const nh = String(notify.getHours()).padStart(2, '0');
          const nm = String(notify.getMinutes()).padStart(2, '0');
          notificationTimeStr = `${nh}:${nm}:00`;
        } else if (event.start.date) {
          // All day event
          // For simplicity, let's treat it as a 9 AM event so we remind at 8 AM?
          // Or just use the date.
          eventDate = event.start.date;
          eventTimeStr = '09:00:00'; // Default to 9 AM for all-day
          notificationTimeStr = '08:00:00'; // 1 hour before
        } else {
          continue; // No start time
        }

        // Check for duplicates
        // We check if a personal reminder exists with same title and event_time for this user
        const { data: existing } = await supabase
          .from('reminders')
          .select('id')
          .eq('user_id', userId)
          .eq('what', summary)
          .eq('event_time', eventTimeStr)
          .eq('when_date', eventDate)
          .maybeSingle();

        if (existing) {
          console.log(`Skipping duplicate: ${summary}`);
          continue;
        }

        // Create reminder
        const payload = {
          user_id: userId,
          reminder_type: 'personal',
          what: summary,
          when_date: eventDate,
          event_time: eventTimeStr,
          notification_time: notificationTimeStr,
          when_time: notificationTimeStr, // fallback
          recurrence: null,
          child_name: null,
          notes: `Imported from Google Calendar (ID: ${event.id})`, // Storing ID in notes for reference
          icon: getReminderIcon(summary, 'one-time'),
          is_completed: false,
          created_at: new Date().toISOString(),
        };

        const { data: savedReminder, error } = await supabase
          .from('reminders')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;

        if (savedReminder) {
          // Schedule notification
          try {
            const notifId = await scheduleReminderNotification(savedReminder);
            await supabase
              .from('reminders')
              .update({ notification_id: notifId })
              .eq('id', savedReminder.id);
          } catch (e) {
            console.error('Notification schedule error', e);
          }
          createdReminders.push(savedReminder);
        }

      } catch (err) {
        console.error('Error importing event:', event.summary, err);
        errors.push({ event: event.summary, error: err.message });
      }
    }

    return { count: createdReminders.length, errors };
  } catch (error) {
    console.error('Import process failed:', error);
    throw error;
  }
};
