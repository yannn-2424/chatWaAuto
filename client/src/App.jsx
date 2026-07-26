import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import {
  MessageSquare,
  Calendar,
  Clock,
  QrCode,
  Users,
  User,
  Plus,
  Trash2,
  Play,
  Pause,
  Send,
  RefreshCw,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Info,
  Lock
} from './components/Icons.jsx';

import Login from './components/Login.jsx';

const RAILWAY_BACKEND_URL = 'https://chatwaauto-production.up.railway.app';

const getBackendUrl = () => {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return RAILWAY_BACKEND_URL;
  }
  return '';
};

const getStoredToken = () => {
  try {
    if (typeof window === 'undefined') return null;
    const val = localStorage.getItem('autowa_token');
    if (!val || val === 'null' || val === 'undefined' || val.trim() === '') return null;
    return val;
  } catch (e) {
    return null;
  }
};

let socketInstance = null;

const getSocket = () => {
  if (!socketInstance && typeof window !== 'undefined') {
    const backendUrl = getBackendUrl();
    const targetUrl = backendUrl || window.location.origin;
    try {
      socketInstance = io(targetUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true
      });
    } catch (e) {
      console.error('Socket initialization error:', e);
    }
  }
  return socketInstance;
};

const api = axios.create({ baseURL: getBackendUrl() });

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', qrCode: null, user: null });
  const [schedules, setSchedules] = useState([]);
  const [targets, setTargets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('schedules');
  const [loading, setLoading] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const handleAdminLogin = async (password) => {
    setLoading(true);
    try {
      const res = await api.post('/api/login', { password });
      if (res && res.data && res.data.token) {
        localStorage.setItem('autowa_token', res.data.token);
        setToken(res.data.token);
        return res.data;
      }
    } catch (err) {
      console.error('Admin login failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogout = () => {
    if (window.confirm('Apakah Anda yakin ingin keluar (Lock Dashboard)?')) {
      localStorage.removeItem('autowa_token');
      setToken(null);
    }
  };

  // Form State for Schedule
  const [formData, setFormData] = useState({
    target_type: 'group',
    target_jid: '',
    target_name: '',
    custom_number: '',
    message: 'Halo {nama}, ini adalah pesan otomatis yang dijadwalkan pada {tanggal} jam {jam}.',
    schedule_type: 'daily',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time: '08:00',
    days_of_week: [1, 2, 3, 4, 5],
  });

  // Form State for Test Send
  const [testSendForm, setTestSendForm] = useState({
    target_jid: '',
    message: 'Ini adalah pesan pengujian dari WA Automation.'
  });

  const fetchSchedules = async () => {
    try {
      const res = await api.get('/api/schedules');
      setSchedules(res.data);
    } catch (e) {
      console.error('Fetch schedules error:', e);
    }
  };

  const fetchTargets = async () => {
    try {
      const res = await api.get('/api/targets');
      setTargets(res.data);
      if (res.data.length > 0 && !formData.target_jid) {
        setFormData(prev => ({
          ...prev,
          target_jid: res.data[0].jid,
          target_name: res.data[0].name
        }));
      }
    } catch (e) {
      console.error('Fetch targets error:', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/api/logs');
      setLogs(res.data);
    } catch (e) {
      console.error('Fetch logs error:', e);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await api.get('/api/status');
      if (res.data) {
        setWaStatus(res.data);
      }
    } catch (e) {
      console.error('Fetch status error:', e);
    }
  };

  useEffect(() => {
    if (!token) return;

    fetchStatus();
    fetchSchedules();
    fetchTargets();
    fetchLogs();

    const activeSocket = getSocket();
    if (activeSocket) {
      activeSocket.on('wa_status', (data) => {
        setWaStatus(data);
        if (data.status === 'connected') {
          setShowQrModal(false);
        }
      });

      activeSocket.on('schedules_updated', () => {
        fetchSchedules();
      });

      activeSocket.on('new_log', (newLog) => {
        setLogs(prev => [newLog, ...prev]);
      });

      activeSocket.on('contacts_updated', () => {
        fetchTargets();
      });
    }

    return () => {
      if (activeSocket) {
        activeSocket.off('wa_status');
        activeSocket.off('schedules_updated');
        activeSocket.off('new_log');
        activeSocket.off('contacts_updated');
      }
    };
  }, [token]);

  const handleLogout = async () => {
    if (window.confirm('Apakah Anda yakin ingin melepaskan koneksi WhatsApp?')) {
      try {
        await api.post('/api/logout');
      } catch (e) {
        alert('Gagal logout: ' + e.message);
      }
    }
  };

  const handleSyncTargets = async () => {
    setLoading(true);
    try {
      await api.post('/api/sync-targets');
      await fetchTargets();
      alert('Berhasil menyinkronkan kontak & grup WA!');
    } catch (e) {
      alert('Gagal sinkronisasi: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    setLoading(true);

    let finalJid = formData.target_jid;
    let finalName = formData.target_name;

    if (formData.target_type === 'custom') {
      let cleanNum = formData.custom_number.replace(/[^0-9]/g, '');
      if (cleanNum.startsWith('0')) {
        cleanNum = '62' + cleanNum.slice(1);
      }
      finalJid = `${cleanNum}@s.whatsapp.net`;
      finalName = `Nomor (${formData.custom_number})`;
    }

    try {
      await api.post('/api/schedules', {
        ...formData,
        target_jid: finalJid,
        target_name: finalName
      });
      setShowScheduleModal(false);
      fetchSchedules();
      alert('Jadwal pesan baru berhasil dibuat!');
    } catch (err) {
      alert('Gagal membuat jadwal: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSchedule = async (id) => {
    try {
      await api.post(`/api/schedules/${id}/toggle`);
      fetchSchedules();
    } catch (e) {
      alert('Gagal mengubah status jadwal');
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (window.confirm('Hapus jadwal pengiriman ini?')) {
      try {
        await api.delete(`/api/schedules/${id}`);
        fetchSchedules();
      } catch (e) {
        alert('Gagal menghapus jadwal');
      }
    }
  };

  const handleTestSend = async (e) => {
    e.preventDefault();
    if (!testSendForm.target_jid || !testSendForm.message) {
      alert('Harap pilih target dan isi pesan!');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/test-send', testSendForm);
      alert('Pesan uji coba berhasil dikirim!');
    } catch (err) {
      alert('Gagal mengirim pesan tes: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (varName) => {
    setFormData(prev => ({
      ...prev,
      message: prev.message + ` ${varName} `
    }));
  };

  const toggleDayOfWeek = (dayNum) => {
    setFormData(prev => {
      const days = prev.days_of_week.includes(dayNum)
        ? prev.days_of_week.filter(d => d !== dayNum)
        : [...prev.days_of_week, dayNum];
      return { ...prev, days_of_week: days };
    });
  };

  const dayLabels = [
    { num: 1, label: 'Senin' },
    { num: 2, label: 'Selasa' },
    { num: 3, label: 'Rabu' },
    { num: 4, label: 'Kamis' },
    { num: 5, label: 'Jumat' },
    { num: 6, label: 'Sabtu' },
    { num: 0, label: 'Minggu' },
  ];

  if (!token) {
    return <Login onLogin={handleAdminLogin} loading={loading} />;
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0b0f19]/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent">
                AutoWA Pro
              </h1>
              <p className="text-xs text-slate-400">WhatsApp Automation & Scheduler</p>
            </div>
          </div>

          {/* WA Status Badge & Admin Lock */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className={`w-3 h-3 rounded-full ${
                waStatus.status === 'connected' ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50' :
                waStatus.status === 'qr_ready' ? 'bg-amber-500 animate-ping' :
                waStatus.status === 'connecting' ? 'bg-blue-500 animate-pulse' : 'bg-rose-500'
              }`} />
              <div className="text-xs">
                <span className="text-slate-400">Status: </span>
                <span className="font-semibold text-slate-200 uppercase tracking-wider">
                  {waStatus.status === 'connected' ? 'Terhubung' :
                   waStatus.status === 'qr_ready' ? 'Siap Scan QR' :
                   waStatus.status === 'connecting' ? 'Menghubungkan...' : 'Terputus'}
                </span>
                {waStatus.user && (
                  <span className="ml-2 text-emerald-400 font-medium">({waStatus.user.name})</span>
                )}
              </div>
            </div>

            {waStatus.status === 'connected' ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect WA
              </button>
            ) : (
              <button
                onClick={() => setShowQrModal(true)}
                className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all"
              >
                <QrCode className="w-4 h-4" />
                Scan QR Code
              </button>
            )}

            <button
              onClick={handleAdminLogout}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
              title="Kunci Dashboard Admin"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Kunci
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total Jadwal Aktif</p>
              <p className="text-2xl font-bold text-slate-100">
                {schedules.filter(s => s.status === 'active').length}
              </p>
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Pesan Terkirim</p>
              <p className="text-2xl font-bold text-slate-100">
                {logs.filter(l => l.status === 'success').length}
              </p>
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Grup WA Tersinkron</p>
              <p className="text-2xl font-bold text-slate-100">
                {targets.filter(t => t.type === 'group').length}
              </p>
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Mode Cron Scheduler</p>
              <p className="text-sm font-semibold text-amber-400">Aktif (Setiap 30s)</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('schedules')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'schedules'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Jadwal Pesan
            </button>
            <button
              onClick={() => setActiveTab('test-send')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'test-send'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Send className="w-4 h-4" />
              Uji Coba Kirim
            </button>
            <button
              onClick={() => setActiveTab('targets')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'targets'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4" />
              Kontak & Grup ({targets.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'logs'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Clock className="w-4 h-4" />
              Log Riwayat ({logs.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncTargets}
              disabled={loading}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync Kontak & Grup
            </button>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-2 text-xs font-bold px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              Buat Jadwal Baru
            </button>
          </div>
        </div>

        {/* Tab 1: Schedules List */}
        {activeTab === 'schedules' && (
          <div className="space-y-4">
            {schedules.length === 0 ? (
              <div className="glass-card p-12 text-center rounded-3xl border border-dashed border-slate-800">
                <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-300">Belum ada jadwal pesan</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Buat jadwal pertama Anda untuk mengirim pesan ke grup atau kontak pribadi secara otomatis.
                </p>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                >
                  <Plus className="w-4 h-4" />
                  Buat Jadwal Pesan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {schedules.map((item) => (
                  <div key={item.id} className="glass-card glass-card-hover p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                    <div className={`absolute top-0 right-0 px-3 py-1 text-[10px] font-bold uppercase rounded-bl-xl ${
                      item.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-l border-b border-emerald-500/30' :
                      item.status === 'completed' ? 'bg-blue-500/20 text-blue-400 border-l border-b border-blue-500/30' :
                      'bg-amber-500/20 text-amber-400 border-l border-b border-amber-500/30'
                    }`}>
                      {item.status === 'active' ? 'Aktif' : item.status === 'completed' ? 'Selesai' : 'Di-Pause'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2 pr-16">
                        {item.target_type === 'group' ? (
                          <Users className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        )}
                        <h4 className="font-semibold text-sm text-slate-100 truncate" title={item.target_name}>
                          {item.target_name}
                        </h4>
                      </div>

                      <div className="p-3 bg-slate-900/90 rounded-xl text-xs text-slate-300 font-mono mb-4 border border-slate-800 line-clamp-3">
                        "{item.message}"
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Tipe Jadwal:</span>
                          <span className="font-medium text-slate-200 capitalize">
                            {item.schedule_type === 'once' ? 'Sekali Kirim' :
                             item.schedule_type === 'daily' ? 'Setiap Hari' : 'Hari Spesifik'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Jam Kirim:</span>
                          <span className="font-medium text-slate-200">{item.scheduled_time}</span>
                        </div>

                        {item.schedule_type === 'once' && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Tanggal:</span>
                            <span className="font-medium text-slate-200">{item.scheduled_date}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                          <span className="text-slate-500">Eksekusi Berikutnya:</span>
                          <span className="font-semibold text-emerald-400">
                            {item.status === 'completed' ? '-' : new Date(item.next_run).toLocaleString('id-ID', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                      {item.status !== 'completed' && (
                        <button
                          onClick={() => handleToggleSchedule(item.id)}
                          className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1 transition-all ${
                            item.status === 'active'
                              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                          title={item.status === 'active' ? 'Pause Jadwal' : 'Aktifkan Jadwal'}
                        >
                          {item.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteSchedule(item.id)}
                        className="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                        title="Hapus Jadwal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Test Send */}
        {activeTab === 'test-send' && (
          <div className="max-w-2xl mx-auto glass-card p-6 rounded-3xl border border-slate-800">
            <h3 className="text-lg font-bold text-slate-100 mb-1 flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-400" />
              Uji Coba Pengiriman Pesan Instan
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Kirim pesan percobaan secara langsung tanpa membuat jadwal untuk memverifikasi koneksi WhatsApp.
            </p>

            <form onSubmit={handleTestSend} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Pilih Target WhatsApp:
                </label>
                <select
                  value={testSendForm.target_jid}
                  onChange={(e) => setTestSendForm({ ...testSendForm, target_jid: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Pilih Kontak atau Grup --</option>
                  {targets.map((t) => (
                    <option key={t.jid} value={t.jid}>
                      [{t.type === 'group' ? 'GRUP' : 'KONTAK'}] {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Pesan Uji Coba:
                </label>
                <textarea
                  rows={4}
                  value={testSendForm.message}
                  onChange={(e) => setTestSendForm({ ...testSendForm, message: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="Ketik pesan yang ingin diuji..."
                />
              </div>

              <button
                type="submit"
                disabled={loading || waStatus.status !== 'connected'}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Kirim Pesan Uji Coba Sekarang
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Targets (Contacts & Groups) */}
        {activeTab === 'targets' && (
          <div className="glass-card p-6 rounded-3xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Daftar Kontak & Grup Tersinkronisasi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {targets.map((item) => (
                <div key={item.jid} className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${item.type === 'group' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {item.type === 'group' ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-semibold text-sm text-slate-200 truncate">{item.name}</h4>
                    <p className="text-[11px] text-slate-500 truncate">{item.jid}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Logs History */}
        {activeTab === 'logs' && (
          <div className="glass-card p-6 rounded-3xl overflow-hidden">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Log Pengiriman Pesan Realtime</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3 rounded-l-xl">Waktu Sent</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Pesan</th>
                    <th className="p-3 rounded-r-xl">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-all">
                      <td className="p-3 font-mono text-slate-400">
                        {new Date(log.sent_at).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 font-semibold text-slate-200">{log.target_name}</td>
                      <td className="p-3 font-mono text-slate-300 max-w-xs truncate">{log.message}</td>
                      <td className="p-3">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Sukses
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 font-semibold text-[11px]" title={log.error_message}>
                            <XCircle className="w-3.5 h-3.5" /> Gagal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal QR Code */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-3xl text-center relative border border-slate-700">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            <QrCode className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <h3 className="text-xl font-bold text-slate-100">Hubungkan WhatsApp</h3>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Buka aplikasi WhatsApp di HP Anda &gt; Menu titik tiga / Pengaturan &gt; Perangkat Tertaut &gt; Scan QR Code di bawah.
            </p>

            {waStatus.qrCode ? (
              <div className="bg-white p-4 rounded-2xl inline-block shadow-xl mb-4">
                <img src={waStatus.qrCode} alt="WhatsApp QR Code" className="w-64 h-64 mx-auto" />
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-xs text-slate-400">Menyiapkan QR Code...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Create Schedule */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card max-w-xl w-full p-6 rounded-3xl my-8 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                Buat Jadwal Otomatisasi Pesan
              </h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4 text-xs">
              {/* Target Type */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tipe Target Pengiriman:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, target_type: 'group' })}
                    className={`p-3 rounded-xl font-semibold border flex items-center justify-center gap-2 transition-all ${
                      formData.target_type === 'group'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Users className="w-4 h-4" /> Grup WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, target_type: 'custom' })}
                    className={`p-3 rounded-xl font-semibold border flex items-center justify-center gap-2 transition-all ${
                      formData.target_type === 'custom'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <User className="w-4 h-4" /> Kontak / Nomor Kustom
                  </button>
                </div>
              </div>

              {/* Target JID Selector */}
              {formData.target_type === 'group' ? (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Pilih Grup Target:</label>
                  <select
                    value={formData.target_jid}
                    onChange={(e) => {
                      const selected = targets.find(t => t.jid === e.target.value);
                      setFormData({
                        ...formData,
                        target_jid: e.target.value,
                        target_name: selected ? selected.name : ''
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {targets.filter(t => t.type === 'group').map((g) => (
                      <option key={g.jid} value={g.jid}>{g.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Nomor WhatsApp (misal: 08123456789):</label>
                  <input
                    type="text"
                    value={formData.custom_number}
                    onChange={(e) => setFormData({ ...formData, custom_number: e.target.value })}
                    placeholder="Contoh: 08123456789"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Schedule Type */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Frekuensi Penjadwalan:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'daily', label: 'Setiap Hari' },
                    { id: 'weekly', label: 'Hari Spesifik' },
                    { id: 'once', label: 'Sekali Kirim' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, schedule_type: st.id })}
                      className={`p-2.5 rounded-xl font-semibold border transition-all ${
                        formData.schedule_type === st.id
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Days selection if weekly */}
              {formData.schedule_type === 'weekly' && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Pilih Hari:</label>
                  <div className="flex flex-wrap gap-2">
                    {dayLabels.map((d) => (
                      <button
                        key={d.num}
                        type="button"
                        onClick={() => toggleDayOfWeek(d.num)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                          formData.days_of_week.includes(d.num)
                            ? 'bg-emerald-500 text-white border-emerald-400'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Time & Date */}
              <div className="grid grid-cols-2 gap-3">
                {formData.schedule_type === 'once' && (
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Tanggal Kirim:</label>
                    <input
                      type="date"
                      value={formData.scheduled_date}
                      onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200"
                    />
                  </div>
                )}
                <div className={formData.schedule_type !== 'once' ? 'col-span-2' : ''}>
                  <label className="block font-semibold text-slate-300 mb-1">Jam Kirim (WIB):</label>
                  <input
                    type="time"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200"
                  />
                </div>
              </div>

              {/* Message Content & Template variables */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-300">Pesan WhatsApp (Custom):</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Insert tag:</span>
                    <button type="button" onClick={() => insertVariable('{nama}')} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-[10px]">{'{nama}'}</button>
                    <button type="button" onClick={() => insertVariable('{tanggal}')} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-[10px]">{'{tanggal}'}</button>
                    <button type="button" onClick={() => insertVariable('{jam}')} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-[10px]">{'{jam}'}</button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all"
              >
                Simpan & Aktifkan Jadwal
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
