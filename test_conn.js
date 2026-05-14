const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ashtubxjarooqjleafpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzaHR1YnhqYXJvb3FqbGVhZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNDkwNjUsImV4cCI6MjA4MDkyNTA2NX0.thbFegREkWcCQyUe7EECiPc_I2uUPlQOYcX1KW0wRCc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing Supabase connection...');
  try {
    const { data, error } = await supabase.from('reminders').select('*').limit(1);
    if (error) {
      console.error('Supabase Error:', error);
    } else {
      console.log('Supabase Connection Successful. Data:', data);
    }
  } catch (err) {
    console.error('Network/Client Error:', err);
  }
}

test();
