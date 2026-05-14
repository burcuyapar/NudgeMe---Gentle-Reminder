import { supabase } from './supabase';
import { saveFamilyData, getCurrentUserId } from './familyService';
import { scheduleReminderNotification, getUserNotificationPreferences, cancelSingleNotification } from './notifications';
import { calculateNotificationTime } from '../utils/timeCalculations';
import { getReminderIcon } from '../utils/reminderIcons';
import { Alert } from 'react-native';

export const ReminderService = {
  /**
   * Insert new reminder into database and schedule notification
   * @param {Object} reminderData - { user_id, what, when_date, when_time, who, reminder_type, notes, reminder_before }
   * @returns {Promise<{success: boolean, data?: any, error?: any}>}
   */
  async createReminder(reminderData) {
    try {
      // 1. Insert reminder into database
      const { data: reminder, error: insertError } = await supabase
        .from('reminders')
        .insert([reminderData])
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Schedule notification
      const notificationId = await scheduleReminderNotification(reminder);

      if (!notificationId) {
        // 3. Rollback: Delete reminder if notification fails
        console.error('❌ CRITICAL: Notification scheduling failed for:', reminder.what);
        
        await supabase
          .from('reminders')
          .delete()
          .eq('id', reminder.id);

        Alert.alert(
          'Notification Error',
          'Failed to schedule notification. Please try again.',
          [{ text: 'OK' }]
        );

        return { success: false, error: new Error('Notification scheduling failed') };
      }

      // 4. Update database with notification_id
      const { error: updateError } = await supabase
        .from('reminders')
        .update({ notification_id: notificationId })
        .eq('id', reminder.id);

      if (updateError) {
        console.error('❌ Failed to update reminder with notification ID:', updateError);
        // Rollback: Cancel notification and delete reminder
        await cancelSingleNotification(notificationId);
        await supabase.from('reminders').delete().eq('id', reminder.id);
        throw updateError;
      }

      console.log('✅ Notification scheduled successfully:', notificationId);
      
      return { success: true, data: { ...reminder, notification_id: notificationId } };
    } catch (error) {
      console.error('Error creating reminder:', error);
      return { success: false, error };
    }
  },

  /**
   * Get all reminders for a user, ordered by date ascending
   * @param {string} userId
   * @returns {Promise<{success: boolean, data?: any[], error?: any}>}
   */
  async getUserReminders(userId) {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .order('when_date', { ascending: true })
        .order('when_time', { ascending: true });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching user reminders:', error);
      return { success: false, error };
    }
  },

  /**
   * Get reminders for today only, filtered by is_completed = false
   * @param {string} userId
   * @returns {Promise<{success: boolean, data?: any[], error?: any}>}
   */
  async getTodayReminders(userId) {
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .eq('when_date', today)
        .eq('is_completed', false)
        .order('when_time', { ascending: true });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching today reminders:', error);
      return { success: false, error };
    }
  },

  /**
   * Update is_completed to true and set updated_at timestamp
   * @param {string} reminderId
   * @returns {Promise<{success: boolean, data?: any, error?: any}>}
   */
  async completeReminder(reminderId) {
    try {
      const { data: reminder, error: fetchError } = await supabase
        .from('reminders')
        .select('notification_id, recurrence')
        .eq('id', reminderId)
        .single();
      if (fetchError) throw fetchError;
      if (reminder?.notification_id && (reminder?.recurrence === 'one-time' || reminder?.recurrence === null)) {
        await cancelSingleNotification(reminder.notification_id);
      }
      const { data, error: updateError } = await supabase
        .from('reminders')
        .update({ is_completed: true, updated_at: new Date() })
        .eq('id', reminderId)
        .select()
        .single();
      if (updateError) throw updateError;
      return { success: true, data };
    } catch (error) {
      console.error('Error completing reminder:', error);
      return { success: false, error };
    }
  },

  /**
   * Update school reminders for a specific child
   * @param {string} userId
   * @param {string} childName
   * @param {string} schoolStart - HH:MM AM/PM
   * @param {string} schoolEnd - HH:MM AM/PM
   */
  async updateSchoolReminders(userId, childName, schoolStart, schoolEnd) {
    try {
      const userPrefs = await getUserNotificationPreferences();

      const handleReminder = async (type, time, title) => {
        // If time is empty/null, find and delete existing reminder
        if (!time) {
          const { data: existing } = await supabase
            .from('reminders')
            .select('id')
            .eq('user_id', userId)
            .eq('child_name', childName)
            .eq('reminder_type', type)
            .single();
          
          if (existing) {
            console.log(`🗑️ Removing ${type} reminder for ${childName} (time cleared)`);
            await this.deleteReminder(existing.id);
          }
          return;
        }

        // Calculate new notification time
        const notifTime = calculateNotificationTime(time, type, title, userPrefs);
        
        // Check for existing reminder to replace
        const { data: existing } = await supabase
          .from('reminders')
          .select('id')
          .eq('user_id', userId)
          .eq('child_name', childName)
          .eq('reminder_type', type)
          .single();

        if (existing) {
          // Delete old one first (handles notification cancellation)
          await this.deleteReminder(existing.id);
        }

        // Create new reminder
        const payload = {
          user_id: userId,
          reminder_type: type,
          what: title,
          icon: '🎒',
          when_time: time,
          event_time: time,
          notification_time: notifTime,
          when_date: null,
          recurrence: 'weekdays',
          child_name: childName,
          is_completed: false
        };

        const res = await this.createReminder(payload);
        if (res.success) {
           console.log(`✅ Updated ${type} reminder for ${childName}`);
        } else {
           console.error(`❌ Failed to update ${type} reminder:`, res.error);
        }
      };

      await handleReminder('school_dropoff', schoolStart, `Get ${childName} ready for school`);
      await handleReminder('school_pickup', schoolEnd, `Pick up ${childName}`);
      
      return { success: true };
    } catch (error) {
      console.error('Error updating school reminders:', error);
      return { success: false, error };
    }
  },

  /**
   * Sync activity reminders for a child (delete all old, create new)
   * @param {string} userId
   * @param {string} childName
   * @param {Array} activities - Array of { name, schedule/time, day }
   */
  async syncActivityReminders(userId, childName, activities) {
    try {
      // 1. Delete all existing activity reminders for this child
      const { data: existing } = await supabase
        .from('reminders')
        .select('id')
        .eq('user_id', userId)
        .eq('child_name', childName)
        .eq('reminder_type', 'activity');
        
      if (existing && existing.length > 0) {
        console.log(`🧹 Clearing ${existing.length} old activity reminders for ${childName}`);
        for (const rem of existing) {
            await this.deleteReminder(rem.id);
        }
      }

      if (!activities || activities.length === 0) return { success: true };

      const userPrefs = await getUserNotificationPreferences();

      // 2. Create new ones
      for (const act of activities) {
        const time = act.schedule || act.time;
        const name = act.name || act.activity; // Handle inconsistent naming
        
        if (!time || !name) continue;

        const notifTime = calculateNotificationTime(time, 'activity', name, userPrefs);
        const icon = getReminderIcon(name, 'activity');
        
        const payload = {
            user_id: userId,
            reminder_type: 'activity',
            what: `${name} for ${childName}`,
            icon: icon,
            when_time: time,
            event_time: time,
            notification_time: notifTime,
            when_date: null,
            recurrence: 'weekly',
            child_name: childName,
            notes: act.day || null,
            is_completed: false
        };
        
        await this.createReminder(payload);
      }
      
      console.log(`✅ Synced ${activities.length} activity reminders for ${childName}`);
      return { success: true };
    } catch (error) {
      console.error('Error syncing activity reminders:', error);
      return { success: false, error };
    }
  },

  /**
   * Delete reminder from database
   * @param {string} reminderId
   * @returns {Promise<{success: boolean, error?: any}>}
   */
  async deleteReminder(reminderId) {
    try {
      const { data: reminder, error: fetchError } = await supabase
        .from('reminders')
        .select('notification_id')
        .eq('id', reminderId)
        .single();
      if (fetchError) throw fetchError;
      if (reminder?.notification_id) {
        const ids = String(reminder.notification_id).split(',').map(id => id.trim()).filter(Boolean);
        for (const id of ids) {
          await cancelSingleNotification(id);
        }
      }
      const { error: deleteError } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderId);
      if (deleteError) throw deleteError;
      return { success: true };
    } catch (error) {
      console.error('Error deleting reminder:', error);
      return { success: false, error };
    }
  }
};

export async function migrateOnboardingReminders(userId) {
  if (!userId) return;
  try {
    await supabase
      .from('reminders')
      .update({ when_date: null, recurrence: 'daily' })
      .eq('user_id', userId)
      .in('reminder_type', ['school_dropoff', 'school_pickup'])
      .is('recurrence', null);
    await supabase
      .from('reminders')
      .update({ when_date: null, recurrence: 'weekly' })
      .eq('user_id', userId)
      .eq('reminder_type', 'activity')
      .is('recurrence', null);
    await supabase
      .from('reminders')
      .update({ when_date: null, recurrence: 'daily' })
      .eq('user_id', userId)
      .eq('reminder_type', 'personal')
      .is('recurrence', null);
  } catch (error) {
    console.error('Error migrating onboarding reminders:', error);
  }
}

export async function saveUserData(data) {
  console.log('💾 Saving to users table:', data);
  // Try to include user email if available
  let email = data?.email || null;
  if (!email) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      email = auth?.user?.email || null;
    } catch {}
  }
  const { data: result, error } = await supabase
    .from('users')
    .insert({
      user_id: data.user_id,
      user_name: data.name,
      email,
      num_children: data.numChildren,
      children_info: JSON.stringify(data.children),
      school_schedule: JSON.stringify(
        (data.children || []).map(c => ({
          name: c.name,
          schoolStartTime: c.schoolStartTime,
          schoolEndTime: c.schoolEndTime,
        }))
      ),
      activities: JSON.stringify(data.activities),
    });
  console.log('💾 Save result:', { result, error });
  if (error && error.code === '42703') {
    // Fallback: insert without user_email if column does not exist
    const { data: result2, error: error2 } = await supabase
      .from('users')
      .insert({
        user_id: data.user_id,
        user_name: data.name,
        num_children: data.numChildren,
        children_info: JSON.stringify(data.children),
        school_schedule: JSON.stringify(
          (data.children || []).map(c => ({
            name: c.name,
            schoolStartTime: c.schoolStartTime,
            schoolEndTime: c.schoolEndTime,
          }))
        ),
        activities: JSON.stringify(data.activities),
      })
      .select();
    console.log('💾 Fallback save result:', { result: result2, error: error2 });
    return { result: result2, error: error2 };
  }
  return { result, error };
}
