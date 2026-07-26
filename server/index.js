process.env.TZ = 'Asia/Jakarta';

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db.js';
import { initWhatsApp, setSocketIO, getStatus } from './waClient.js';
import { startScheduler, setSchedulerSocketIO } from './scheduler.js';
import routes from './routes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

// WA Automation Backend Server - v1.0.2 (Auth & Persistence Ready)
app.use('/api', routes);

// Serve Static React Client Build in Production
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, '../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
}

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('Client connected to socket:', socket.id);
  
  // Send current status immediately upon connection
  socket.emit('wa_status', getStatus());

  socket.on('disconnect', () => {
    console.log('Client disconnected from socket:', socket.id);
  });
});

// Attach Socket.IO instances to modules
setSocketIO(io);
setSchedulerSocketIO(io);

const PORT = process.env.PORT || 5001;

// Initialize System
const startServer = async () => {
  try {
    console.log('Initializing SQLite Database...');
    await initDb();
    console.log('Database initialized successfully.');

    console.log('Initializing WhatsApp Engine...');
    await initWhatsApp();

    console.log('Starting Scheduler Engine...');
    startScheduler();

    server.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`🚀 WA Automation Server running on port ${PORT}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
