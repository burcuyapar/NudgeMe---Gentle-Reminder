export function getNextWeekdayOccurrence(timeString) {
  const now = new Date();
  const parts = String(timeString || '').split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  let targetDate = new Date();
  targetDate.setHours(hours, minutes, 0, 0);
  if (targetDate < now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  const day = targetDate.getDay();
  if (day === 0) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (day === 6) {
    targetDate.setDate(targetDate.getDate() + 2);
  }
  return targetDate.toISOString().split('T')[0];
}

export function getNextDayOccurrence(dayName, timeString) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDay = days.indexOf(dayName || '');
  const now = new Date();
  const parts = String(timeString || '').split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  let targetDate = new Date(now);
  targetDate.setHours(hours, minutes, 0, 0);
  if (targetDay === -1) {
    if (targetDate < now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    return targetDate.toISOString().split('T')[0];
  }
  const currentDay = now.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil < 0 || (daysUntil === 0 && targetDate < now)) {
    daysUntil += 7;
  }
  targetDate.setDate(now.getDate() + daysUntil);
  return targetDate.toISOString().split('T')[0];
}

export function getNextOccurrence(timeString) {
  const now = new Date();
  const parts = String(timeString || '').split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  let targetDate = new Date();
  targetDate.setHours(hours, minutes, 0, 0);
  if (targetDate < now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  return targetDate.toISOString().split('T')[0];
}

