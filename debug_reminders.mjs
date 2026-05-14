import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ashtubxjarooqjleafpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzaHR1YnhqYXJvb3FqbGVhZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNDkwNjUsImV4cCI6MjA4MDkyNTA2NX0.thbFegREkWcCQyUe7EECiPc_I2uUPlQOYcX1KW0wRCc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkReminders() {
  console.log('Connecting to Supabase...');
  
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching reminders:', error);
    return;
  }

  console.log(`Found ${reminders.length} reminders.`);

  const schoolReminders = reminders.filter(r => 
    r.reminder_type === 'school_dropoff' || r.reminder_type === 'school_pickup'
  );

  console.log(`\n--- School Reminders (${schoolReminders.length}) ---`);
  schoolReminders.forEach(r => {
    console.log(`
      ID: ${r.id}
      What: ${r.what}
      Type: ${r.reminder_type}
      When Time: ${r.when_time}
      Notification Time: ${r.notification_time}
      Event Time: ${r.event_time}
      Recurrence: ${r.recurrence}
      Child: ${r.child_name}
      Notification ID: ${r.notification_id}
      Created At: ${r.created_at}
    `);
  });

  console.log('\n--- Other Reminders (Sample) ---');
  reminders.filter(r => !schoolReminders.includes(r)).slice(0, 3).forEach(r => {
     console.log(`[${r.reminder_type}] ${r.what} (Time: ${r.when_time})`);
  });
}

checkReminders();
