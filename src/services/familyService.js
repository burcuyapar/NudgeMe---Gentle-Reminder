import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { cancelSingleNotification } from './notifications';

export const getCurrentUserId = async () => {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id || null;
    if (uid) return uid;
  } catch {}
  try {
    const storedUid = await AsyncStorage.getItem('user_id');
    if (storedUid) return storedUid;
  } catch {}
  const generated = 'temp_' + Date.now();
  try {
    await AsyncStorage.setItem('user_id', generated);
  } catch {}
  return generated;
};

export const getUserNotificationPreferences = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data?.notification_preferences || null;
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return null;
  }
};

export const saveSchoolSchedule = async (scheduleData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('missing-user-id');

    const { error } = await supabase
      .from('users')
      .update({ school_schedule: scheduleData })
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Failed to save school schedule:', error);
    return { success: false, error };
  }
};

export const saveActivities = async (activitiesData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('missing-user-id');

    const { error } = await supabase
      .from('users')
      .update({ activities: activitiesData })
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Failed to save activities:', error);
    return { success: false, error };
  }
};

export const saveFamilyData = async (childrenData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('missing-user-id');

    // 1. Save to Children Table (Primary)
    // Map existing structure to table columns
    const upsertPromises = childrenData.map(async (child) => {
      const payload = {
        user_id: userId,
        name: child.name,
        age: parseFloat(child.age) || null,
        dropoff_time: child.school_start || null,
        pickup_time: child.school_end || null,
        // If these fields exist in object, save them
        school_name: child.school_name || null,
        grade: child.grade || null,
        activities: JSON.stringify(child.activities || []),
        bedtime: child.bedtime || null
      };

      // If child has an ID, include it for update
      if (child.id) {
        payload.id = child.id;
      } else {
        // Try to find by name to update existing
        const { data: existing } = await supabase
          .from('children')
          .select('id')
          .eq('user_id', userId)
          .eq('name', child.name)
          .single();
          
        if (existing) {
          payload.id = existing.id;
        }
      }

      return supabase.from('children').upsert(payload);
    });

    await Promise.all(upsertPromises);

    // 2. Keep JSONB in sync for backward compatibility (Optional but safe)
    let upsertError = null;
    try {
      const { data: existing, error: checkError } = await supabase
        .from('users')
        .select('user_id')
        .eq('user_id', userId)
        .limit(1);
      
      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      if (existing && existing.length > 0) {
         const { error: updErr } = await supabase
            .from('users')
            .update({ children_info: childrenData })
            .eq('user_id', userId);
         if (updErr) throw updErr;
      } else {
         const { error: insErr } = await supabase
            .from('users')
            .insert([{ user_id: userId, children_info: childrenData }]);
         if (insErr) throw insErr;
      }
    } catch (err) {
      upsertError = err;
    }

    if (upsertError && upsertError.code !== 'PGRST205' && upsertError.code !== '404') {
       console.warn('Cloud save failed (JSONB):', upsertError);
    }

    // Save to AsyncStorage
    try {
      const stored = await AsyncStorage.getItem('userData');
      const parsed = stored ? JSON.parse(stored) : {};
      const next = { ...parsed, children: childrenData };
      await AsyncStorage.setItem('userData', JSON.stringify(next));
    } catch (e) {
      console.error('Local save failed', e);
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to save family info', e);
    return { success: false, error: e };
  }
};

export const migrateChildrenData = async (userId) => {
  if (!userId) return;
  
  try {
    // Check if children table has data
    const { count, error: countErr } = await supabase
      .from('children')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
      
    if (countErr) throw countErr;
    
    // If data exists, assume migration done (or partial). 
    // But we might want to force update if JSONB is newer? 
    // For now, only migrate if table is empty to avoid overwriting newer data.
    if (count > 0) return; 

    // Fetch JSONB
    const { data: userData, error: userErr } = await supabase
      .from('users')
      .select('children_info')
      .eq('user_id', userId)
      .single();
      
    if (userErr || !userData || !userData.children_info) return;
    
    const children = typeof userData.children_info === 'string' 
      ? JSON.parse(userData.children_info) 
      : userData.children_info;
      
    if (!Array.isArray(children) || children.length === 0) return;
    
    console.log(`Migrating ${children.length} children for user ${userId}...`);
    
    // Insert into children table
    await saveFamilyData(children);
    
  } catch (e) {
    console.error('Migration failed:', e);
  }
};

export const getChildren = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    
    // Try children table first
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('user_id', userId);
      
    if (!error && data && data.length > 0) {
      // Also fetch JSONB from users table to get notes if they are missing in children table
      let jsonChildren = [];
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('children_info')
          .eq('user_id', userId)
          .single();
          
        if (userData?.children_info) {
          jsonChildren = typeof userData.children_info === 'string' 
            ? JSON.parse(userData.children_info) 
            : userData.children_info;
        }
      } catch (e) {
        console.warn('Failed to fetch backup JSONB:', e);
      }

      // Map back to app structure
      return data.map(c => {
        // Find matching child in JSONB to get notes
        const jsonChild = Array.isArray(jsonChildren) 
          ? jsonChildren.find(jc => jc.name === c.name) 
          : {};

        return {
          id: c.id,
          name: c.name,
          age: c.age ? String(c.age) : '',
          school_start: c.dropoff_time,
          school_end: c.pickup_time,
          school_name: c.school_name,
          grade: c.grade,
          activities: typeof c.activities === 'string' ? JSON.parse(c.activities) : c.activities,
          bedtime: c.bedtime,
          // Merge notes from JSONB if available
          special_notes: c.special_notes || jsonChild?.special_notes || '',
          routine_notes: c.routine_notes || jsonChild?.routine_notes || ''
        };
      });
    }
    
    // Fallback to JSONB + Migrate
    await migrateChildrenData(userId);
    
    // Retry fetch or return from JSONB (via migrate which calls save)
    // Just fetch again
    const { data: retryData } = await supabase
      .from('children')
      .select('*')
      .eq('user_id', userId);
      
    if (retryData && retryData.length > 0) {
      return retryData.map(c => ({
        id: c.id,
        name: c.name,
        age: c.age ? String(c.age) : '',
        school_start: c.dropoff_time,
        school_end: c.pickup_time,
        activities: typeof c.activities === 'string' ? JSON.parse(c.activities) : c.activities,
        bedtime: c.bedtime
      }));
    }
    
    return [];
  } catch (e) {
    console.error('Failed to get children:', e);
    return [];
  }
};

export const cleanupRemindersData = async (userId) => {
  if (!userId) return;
  console.log('Starting cleanup of reminders...');
  
  try {
    // 1. Fix miscategorized Bedtime reminders
    const { data: badBedtimes, error: fetchErr } = await supabase
      .from('reminders')
      .select('id, title, child_name')
      .eq('user_id', userId)
      .neq('reminder_type', 'bedtime')
      .ilike('title', '%Bedtime%');
      
    if (!fetchErr && badBedtimes && badBedtimes.length > 0) {
       console.log(`Found ${badBedtimes.length} miscategorized bedtime reminders.`);
       for (const r of badBedtimes) {
         let childName = r.child_name;
         if (!childName) {
            const match = r.title.match(/^(.*?)'s Bedtime/i);
            if (match) childName = match[1];
         }
         
         await supabase
           .from('reminders')
           .update({ 
             reminder_type: 'bedtime', 
             category: 'routine',
             child_name: childName 
           })
           .eq('id', r.id);
       }
    }

    // 2. Remove Duplicates
    const { data: allReminders } = await supabase
      .from('reminders')
      .select('id, title, when_time, reminder_type, created_at, notification_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (allReminders) {
       const seen = new Set();
       const toDelete = [];
       const notificationIdsToCancel = [];
       
       for (const r of allReminders) {
          const key = `${r.title}|${r.when_time}|${r.reminder_type}`;
          if (seen.has(key)) {
             toDelete.push(r.id);
             if (r.notification_id) notificationIdsToCancel.push(r.notification_id);
          } else {
             seen.add(key);
          }
       }
       
       if (toDelete.length > 0) {
          console.log(`Deleting ${toDelete.length} duplicate reminders.`);
          
          // Cancel notifications for duplicates
          for (const nid of notificationIdsToCancel) {
             const ids = String(nid).split(',').map(s => s.trim()).filter(Boolean);
             for (const id of ids) {
                await cancelSingleNotification(id);
             }
          }

          await supabase
            .from('reminders')
            .delete()
            .in('id', toDelete);
       }
    }
    
  } catch (e) {
    console.error('Cleanup failed:', e);
  }
};
