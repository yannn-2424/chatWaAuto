import cron from 'node-cron';
import { query, run, getOne } from './db.js';
import { sendMessage } from './waClient.js';

let io = null;

export const setSchedulerSocketIO = (socketIoInstance) => {
  io = socketIoInstance;
};

export const calculateNextRun = (scheduleType, scheduledDate, scheduledTime, daysOfWeekStr) => {
  const now = new Date();
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  if (scheduleType === 'once') {
    const targetDate = new Date(`${scheduledDate}T${scheduledTime}:00`);
    return targetDate.toISOString();
  }

  if (scheduleType === 'daily') {
    let nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    if (nextDate <= now) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    return nextDate.toISOString();
  }

  if (scheduleType === 'weekly') {
    let days = [];
    try {
      days = typeof daysOfWeekStr === 'string' ? JSON.parse(daysOfWeekStr) : daysOfWeekStr;
      if (!Array.isArray(days) || days.length === 0) days = [1]; // Default Monday
    } catch (e) {
      days = [1];
    }

    // Sort days
    days = days.map(Number).sort((a, b) => a - b);

    let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    // Find next day match
    for (let i = 0; i <= 7; i++) {
      const currentDayOfWeek = checkDate.getDay();
      if (days.includes(currentDayOfWeek) && checkDate > now) {
        return checkDate.toISOString();
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
  }

  return now.toISOString();
};

export const processScheduledMessages = async () => {
  try {
    const nowIso = new Date().toISOString();
    // Fetch active schedules where next_run <= now
    const dueSchedules = await query(
      `SELECT * FROM schedules WHERE status = 'active' AND next_run <= ?`,
      [nowIso]
    );

    for (const schedule of dueSchedules) {
      console.log(`Executing schedule ID #${schedule.id} -> ${schedule.target_name}`);

      // Template variables replacement
      const now = new Date();
      const formattedDate = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
      const formattedTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      let parsedMessage = schedule.message
        .replace(/\{nama\}/g, schedule.target_name)
        .replace(/\{tanggal\}/g, formattedDate)
        .replace(/\{jam\}/g, formattedTime);

      let sendSuccess = false;
      let errorMsg = null;

      try {
        await sendMessage(schedule.target_jid, parsedMessage);
        sendSuccess = true;
      } catch (err) {
        console.error(`Failed to send message for schedule #${schedule.id}:`, err.message);
        errorMsg = err.message;
      }

      // 1. Log result
      const logStatus = sendSuccess ? 'success' : 'failed';
      const logResult = await run(
        `INSERT INTO logs (schedule_id, target_name, target_jid, message, status, error_message, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [schedule.id, schedule.target_name, schedule.target_jid, parsedMessage, logStatus, errorMsg, new Date().toISOString()]
      );

      if (io) {
        io.emit('new_log', {
          id: logResult.id,
          schedule_id: schedule.id,
          target_name: schedule.target_name,
          target_jid: schedule.target_jid,
          message: parsedMessage,
          status: logStatus,
          error_message: errorMsg,
          sent_at: new Date().toISOString()
        });
      }

      // 2. Update next run or complete schedule
      if (schedule.schedule_type === 'once') {
        await run(`UPDATE schedules SET status = 'completed' WHERE id = ?`, [schedule.id]);
      } else {
        const nextRun = calculateNextRun(
          schedule.schedule_type,
          schedule.scheduled_date,
          schedule.scheduled_time,
          schedule.days_of_week
        );
        await run(`UPDATE schedules SET next_run = ? WHERE id = ?`, [nextRun, schedule.id]);
      }

      if (io) io.emit('schedules_updated');
    }
  } catch (err) {
    console.error('Error in processScheduledMessages:', err);
  }
};

export const startScheduler = () => {
  // Check every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    processScheduledMessages();
  });
  console.log('Scheduler cron service started (checking every 30 seconds)');
};
