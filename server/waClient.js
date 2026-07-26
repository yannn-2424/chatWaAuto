import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { run, query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sock = null;
let io = null;
let qrCodeData = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'qr_ready'
let userInfo = null;

const authDir = process.env.AUTH_DIR || (fs.existsSync('/data') ? '/data/auth_info_baileys' : path.join(__dirname, 'auth_info_baileys'));

export const setSocketIO = (socketIoInstance) => {
  io = socketIoInstance;
};

export const getStatus = () => {
  return {
    status: connectionStatus,
    qrCode: qrCodeData,
    user: userInfo
  };
};

export const initWhatsApp = async () => {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr_ready';
      try {
        qrCodeData = await QRCode.toDataURL(qr);
        console.log('📌 QR Code baru berhasil dibuat dan siap di-scan!');
        if (io) {
          io.emit('wa_status', { status: connectionStatus, qrCode: qrCodeData, user: null });
        }
      } catch (err) {
        console.error('Error generating QR Code data URL:', err);
      }
    }

    if (connection === 'connecting') {
      console.log('⏳ Menghubungkan ke WhatsApp...');
      connectionStatus = 'connecting';
      if (io) io.emit('wa_status', getStatus());
    }

    if (connection === 'open') {
      console.log('✅ Terhubung ke WhatsApp!');
      connectionStatus = 'connected';
      qrCodeData = null;
      userInfo = {
        id: sock.user.id,
        name: sock.user.name || sock.user.notify || 'WhatsApp User'
      };

      if (io) io.emit('wa_status', getStatus());

      // Sync groups & contacts
      setTimeout(async () => {
        await syncGroupsAndContacts();
      }, 3000);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connectionStatus = 'disconnected';
      qrCodeData = null;
      userInfo = null;

      if (io) io.emit('wa_status', getStatus());

      if (shouldReconnect) {
        console.log('Reconnecting to WhatsApp...');
        setTimeout(() => {
          initWhatsApp();
        }, 3000);
      } else {
        console.log('Logged out from WhatsApp. Cleaning auth folder...');
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
        }
      }
    }
  });

  sock.ev.on('contacts.upsert', async (contacts) => {
    for (const contact of contacts) {
      if (contact.id && !contact.id.endsWith('@g.us')) {
        const name = contact.name || contact.notify || contact.verifiedName || contact.id.split('@')[0];
        await run(
          `INSERT INTO contacts (jid, name, type, updated_at) VALUES (?, ?, 'user', ?)
           ON CONFLICT(jid) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
          [contact.id, name, new Date().toISOString()]
        );
      }
    }
  });
};

export const logoutWhatsApp = async () => {
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  connectionStatus = 'disconnected';
  qrCodeData = null;
  userInfo = null;
  if (io) io.emit('wa_status', getStatus());
  initWhatsApp();
};

export const syncGroupsAndContacts = async () => {
  if (!sock || connectionStatus !== 'connected') return;

  try {
    // 1. Fetch participating groups
    const groups = await sock.groupFetchAllParticipating();
    const now = new Date().toISOString();

    for (const groupJid of Object.keys(groups)) {
      const group = groups[groupJid];
      await run(
        `INSERT INTO contacts (jid, name, type, updated_at) VALUES (?, ?, 'group', ?)
         ON CONFLICT(jid) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
        [group.id, group.subject || 'Grup WA', now]
      );
    }

    if (io) io.emit('contacts_updated');
  } catch (err) {
    console.error('Failed to sync groups:', err);
  }
};

export const sendMessage = async (jid, text) => {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp belum terhubung! Silakan scan QR code terlebih dahulu.');
  }

  // Formatting JID if phone number passed as raw number or with leading 0
  let targetJid = jid;
  if (!targetJid.includes('@')) {
    let cleanNumber = targetJid.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    }
    targetJid = `${cleanNumber}@s.whatsapp.net`;
  } else if (targetJid.endsWith('@s.whatsapp.net')) {
    const rawNumber = targetJid.split('@')[0];
    if (rawNumber.startsWith('0')) {
      const cleanNumber = '62' + rawNumber.slice(1);
      targetJid = `${cleanNumber}@s.whatsapp.net`;
    }
  }

  const result = await sock.sendMessage(targetJid, { text });
  return result;
};
