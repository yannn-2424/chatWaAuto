import express from 'express';
import jwt from 'jsonwebtoken';
import { query, run, getOne } from './db.js';
import { getStatus, logoutWhatsApp, sendMessage, syncGroupsAndContacts } from './waClient.js';
import { calculateNextRun } from './scheduler.js';
import { authMiddleware, JWT_SECRET, ADMIN_PASSWORD } from './authMiddleware.js';

const router = express.Router();

// POST /api/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password wajib diisi!' });
  }

  const inputPassword = String(password).trim();
  const expectedPassword = String(ADMIN_PASSWORD || 'admin123').trim();

  if (inputPassword !== expectedPassword) {
    return res.status(401).json({ error: 'Password salah! Akses ditolak.' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    success: true,
    token,
    message: 'Login berhasil! Selamat datang kembali.'
  });
});

// GET /api/status (Public)
router.get('/status', (req, res) => {
  res.json(getStatus());
});

// Protect all private routes below with authMiddleware
router.use(authMiddleware);

// Logout WA
router.post('/logout', async (req, res) => {
  try {
    await logoutWhatsApp();
    res.json({ success: true, message: 'Berhasil logout dari WhatsApp' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Manual Contacts & Groups
router.post('/sync-targets', async (req, res) => {
  try {
    await syncGroupsAndContacts();
    res.json({ success: true, message: 'Singkronisasi kontak & grup berhasil' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Targets (Contacts & Groups)
router.get('/targets', async (req, res) => {
  try {
    const targets = await query('SELECT * FROM contacts ORDER BY name ASC');
    res.json(targets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Schedules
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await query('SELECT * FROM schedules ORDER BY created_at DESC');
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Schedule
router.post('/schedules', async (req, res) => {
  try {
    const {
      target_type,
      target_jid,
      target_name,
      message,
      schedule_type,
      scheduled_date,
      scheduled_time,
      days_of_week
    } = req.body;

    if (!target_jid || !message || !schedule_type || !scheduled_time) {
      return res.status(400).json({ error: 'Data jadwal tidak lengkap!' });
    }

    const daysOfWeekStr = Array.isArray(days_of_week) ? JSON.stringify(days_of_week) : (days_of_week || '[]');
    const nextRun = calculateNextRun(schedule_type, scheduled_date, scheduled_time, daysOfWeekStr);
    const createdAt = new Date().toISOString();

    const result = await run(
      `INSERT INTO schedules 
      (target_type, target_jid, target_name, message, schedule_type, scheduled_date, scheduled_time, days_of_week, status, next_run, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        target_type || 'private',
        target_jid,
        target_name || target_jid,
        message,
        schedule_type,
        scheduled_date || null,
        scheduled_time,
        daysOfWeekStr,
        nextRun,
        createdAt
      ]
    );

    const newSchedule = await getOne('SELECT * FROM schedules WHERE id = ?', [result.id]);
    res.status(201).json(newSchedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Schedule
router.put('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      target_type,
      target_jid,
      target_name,
      message,
      schedule_type,
      scheduled_date,
      scheduled_time,
      days_of_week,
      status
    } = req.body;

    const daysOfWeekStr = Array.isArray(days_of_week) ? JSON.stringify(days_of_week) : (days_of_week || '[]');
    const nextRun = calculateNextRun(schedule_type, scheduled_date, scheduled_time, daysOfWeekStr);

    await run(
      `UPDATE schedules SET
        target_type = ?,
        target_jid = ?,
        target_name = ?,
        message = ?,
        schedule_type = ?,
        scheduled_date = ?,
        scheduled_time = ?,
        days_of_week = ?,
        status = ?,
        next_run = ?
      WHERE id = ?`,
      [
        target_type,
        target_jid,
        target_name,
        message,
        schedule_type,
        scheduled_date || null,
        scheduled_time,
        daysOfWeekStr,
        status || 'active',
        nextRun,
        id
      ]
    );

    const updated = await getOne('SELECT * FROM schedules WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Status (Active / Paused)
router.post('/schedules/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getOne('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });

    const newStatus = existing.status === 'active' ? 'paused' : 'active';
    let nextRun = existing.next_run;

    if (newStatus === 'active') {
      nextRun = calculateNextRun(
        existing.schedule_type,
        existing.scheduled_date,
        existing.scheduled_time,
        existing.days_of_week
      );
    }

    await run('UPDATE schedules SET status = ?, next_run = ? WHERE id = ?', [newStatus, nextRun, id]);
    const updated = await getOne('SELECT * FROM schedules WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Schedule
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM schedules WHERE id = ?', [id]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test Direct Send Message
router.post('/test-send', async (req, res) => {
  try {
    const { target_jid, message } = req.body;
    if (!target_jid || !message) {
      return res.status(400).json({ error: 'Target dan pesan tidak boleh kosong!' });
    }

    await sendMessage(target_jid, message);
    res.json({ success: true, message: 'Pesan tes berhasil dikirim!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await query('SELECT * FROM logs ORDER BY sent_at DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
